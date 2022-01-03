// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';
import './libraries/JBErrors.sol';

import './interfaces/IJBTokenStore.sol';
import './interfaces/IJBProjects.sol';
import './interfaces/IJBSplitsStore.sol';
import './interfaces/IJBTerminal.sol';
import './interfaces/IJBOperatorStore.sol';
import './interfaces/IJBFundingCycleDataSource.sol';
import './interfaces/IJBPrices.sol';
import './interfaces/IJBController.sol';

import './structs/JBFundingCycleData.sol';
import './structs/JBFundingCycleMetadata.sol';
import './structs/JBFundAccessConstraints.sol';
import './structs/JBGroupedSplits.sol';

// Inheritance
import './interfaces/IJBController.sol';
import './abstract/JBOperatable.sol';
import './abstract/JBTerminalUtility.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

// --------------------------- custom errors -------------------------- //
//*********************************************************************//
error INVALID_BALLOT_REDEMPTION_RATE();
error INVALID_RESERVED_RATE();
error INVALID_REDEMPTION_RATE();

/**
  @notice
  Stitches together funding cycles and community tokens, making sure all activity is accounted for and correct.

  @dev 
  A project can transfer control from this contract to another allowed controller contract at any time.

  Inherits from:

  IJBController - general interface for the generic controller methods in this contract that interacts with funding cycles and tokens according to the Juicebox protocol's rules.
  JBTerminalUtility - provides tools for contracts that has functionality that can only be accessed
  by a project's terminals. 
  JBOperatable - several functions in this contract can only be accessed by a project owner, or an address that has been preconfifigured to be an operator of the project.
  ReentrencyGuard - several function in this contract shouldn't be accessible recursively.
*/
contract JBController is IJBController, JBTerminalUtility, JBOperatable, ReentrancyGuard {
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  event SetFundAccessConstraints(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    JBFundAccessConstraints constraints,
    address caller
  );
  event DistributeReservedTokens(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 count,
    uint256 beneficiaryTokenCount,
    string memo,
    address caller
  );

  event DistributeToReservedTokenSplit(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    JBSplit split,
    uint256 count,
    address caller
  );

  event MintTokens(
    address indexed beneficiary,
    uint256 indexed projectId,
    uint256 indexed count,
    string memo,
    uint256 reservedRate,
    address caller
  );

  event BurnTokens(
    address indexed holder,
    uint256 indexed projectId,
    uint256 count,
    string memo,
    address caller
  );

  event Migrate(uint256 indexed projectId, IJBController to, address caller);

  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /** 
    @notice
    Max. Token Rate.
  */
  uint constant MAX_TOKEN_RATE = 10000;

  /** 
    @notice
    The difference between the processed token tracker of a project and the project's token's total supply is the amount of tokens that
    still need to have reserves minted against them.

    _projectId The ID of the project to get the tracker of.
  */
  mapping(uint256 => int256) private _processedTokenTrackerOf;

  //*********************************************************************//
  // --------------- public immutable stored properties ---------------- //
  //*********************************************************************//

  /** 
    @notice 
    The Projects contract which mints ERC-721's that represent project ownership.
  */
  IJBProjects public immutable projects;

  /** 
    @notice 
    The contract storing all funding cycle configurations.
  */
  IJBFundingCycleStore public immutable fundingCycleStore;

  /** 
    @notice 
    The contract that manages token minting and burning.
  */
  IJBTokenStore public immutable tokenStore;

  /** 
    @notice 
    The contract that stores splits for each project.
  */
  IJBSplitsStore public immutable splitsStore;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /**
    @notice 
    The amount of overflow that a project is allowed to tap into on-demand throughout configuration.

    _projectId The ID of the project to get the current overflow allowance of.
    _configuration The configuration of the during which the allowance applies.
    _terminal The terminal managing the overflow.
  */
  mapping(uint256 => mapping(uint256 => mapping(IJBTerminal => uint256)))
    public
    override overflowAllowanceOf;

  /**
    @notice 
    The amount of that a project can withdraw per funding cycle.

    _projectId The ID of the project to get the current distribution limit of.
    _configuration The configuration during which the distribution limit applies.
    _terminal The terminal from which distributions are being limited. 
  */
  mapping(uint256 => mapping(uint256 => mapping(IJBTerminal => uint256)))
    public
    override distributionLimitOf;

  /**
    @notice 
    The currency that overflow allowances and distribution limits are measured in for a particular funding cycle configuration, applied only to the specified terminal.

    _projectId The ID of the project to get the currency of.
    _configuration The configuration during which the currency applies.
    _terminal The terminal for which the currency should be used. 
  */
  mapping(uint256 => mapping(uint256 => mapping(IJBTerminal => uint256)))
    public
    override currencyOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the amount of reserved tokens that a project has available to distribute.

    @param _projectId The ID of the project to get a reserved token balance of.
    @param _reservedRate The reserved rate to use when making the calculation.

    @return The current amount of reserved tokens.
  */
  function reservedTokenBalanceOf(uint256 _projectId, uint256 _reservedRate)
    external
    view
    override
    returns (uint256)
  {
    return
      _reservedTokenAmountFrom(
        _processedTokenTrackerOf[_projectId],
        _reservedRate,
        tokenStore.totalSupplyOf(_projectId)
      );
  }

  //*********************************************************************//
  // ---------------------------- constructor -------------------------- //
  //*********************************************************************//

  /**
    @param _operatorStore A contract storing operator assignments.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _fundingCycleStore A contract storing all funding cycle configurations.
    @param _tokenStore A contract that manages token minting and burning.
    @param _splitsStore A contract that stores splits for each project.
  */
  constructor(
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBFundingCycleStore _fundingCycleStore,
    IJBTokenStore _tokenStore,
    IJBSplitsStore _splitsStore
  ) JBTerminalUtility(_directory) JBOperatable(_operatorStore) {
    projects = _projects;
    fundingCycleStore = _fundingCycleStore;
    tokenStore = _tokenStore;
    splitsStore = _splitsStore;
  }

  //*********************************************************************//
  // --------------------- external transactions ----------------------- //
  //*********************************************************************//

  /**
    @notice
    Creates a project. This will mint an ERC-721 into the specified owner's account, configure a first funding cycle, and set up any splits.

    @dev
    Each operation within this transaction can be done in sequence separately.

    @dev
    Anyone can deploy a project on an owner's behalf.

    @param _owner The address to set as the owner of the project. The project ERC-721 will be owned by this address.
    @param _handle The project's unique handle. This can be updated any time by the owner of the project.
    @param _metadataCid A link to associate with the project. This can be updated any time by the owner of the project.
    @param _data A JBFundingCycleData data structure that defines the project's first funding cycle. These properties will remain fixed for the duration of the funding cycle.
      @dev _data.target The amount that the project wants to payout during a funding cycle. Sent as a wad (18 decimals).
      @dev _data.currency The currency of the `target`. Send 0 for ETH or 1 for USD.
      @dev _data.duration The duration of the funding cycle for which the `target` amount is needed. Measured in days. Send 0 for cycles that are reconfigurable at any time.
      @dev _data.weight The weight of the funding cycle.
        This number is interpreted as a wad, meaning it has 18 decimal places.
        The protocol uses the weight to determine how many tokens to mint upon receiving a payment during a funding cycle.
        A value of 0 means that the weight should be inherited and potentially discounted from the currently active cycle if possible. Otherwise a weight of 0 will be used.
        A value of 1 means that no tokens should be minted regardless of how many ETH was paid. The protocol will set the stored weight value to 0.
        A value of 1 X 10^18 means that one token should be minted per ETH received.
      @dev _data.discountRate A number from 0-1000000000 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
        If it's 0, each funding cycle will have equal weight.
        If the number is 900000000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
      @dev _data.ballot The ballot contract that will be used to approve subsequent reconfigurations. Must adhere to the IFundingCycleBallot interface.
    @param _metadata A JBFundingCycleMetadata data structure specifying the controller specific params that a funding cycle can have. These properties will remain fixed for the duration of the funding cycle.
      @dev _metadata.reservedRate A number from 0-10000 (0-100%) indicating the percentage of each contribution's newly minted tokens that will be reserved for the token splits.
      @dev _metadata.redemptionRate The rate from 0-10000 (0-100%) that tunes the bonding curve according to which a project's tokens can be redeemed for overflow.
        The bonding curve formula is https://www.desmos.com/calculator/sp9ru6zbpk
        where x is _count, o is _currentOverflow, s is _totalSupply, and r is _redemptionRate.
      @dev _metadata.ballotRedemptionRate The redemption rate to apply when there is an active ballot.
      @dev _metadata.pausePay Whether or not the pay functionality should be paused during this cycle.
      @dev _metadata.pauseWithdrawals Whether or not the withdraw functionality should be paused during this cycle.
      @dev _metadata.pauseRedeem Whether or not the redeem functionality should be paused during this cycle.
      @dev _metadata.pauseMint Whether or not the mint functionality should be paused during this cycle.
      @dev _metadata.pauseBurn Whether or not the burn functionality should be paused during this cycle.
      @dev _metadata.allowTerminalMigration Whether or not the terminal migration functionality should be paused during this cycle.
      @dev _metadata.allowControllerMigration Whether or not the controller migration functionality should be paused during this cycle.
      @dev _metadata.holdFees Whether or not fees should be held to be processed at a later time during this cycle.
      @dev _metadata.useDataSourceForPay Whether or not the data source should be used when processing a payment.
      @dev _metadata.useDataSourceForRedeem Whether or not the data source should be used when processing a redemption.
      @dev _metadata.dataSource A contract that exposes data that can be used within pay and redeem transactions. Must adhere to IJBFundingCycleDataSource.
    @param _groupedSplits An array of splits to set for any number of group.
    @param _fundAccessConstraints An array containing amounts, in wei (18 decimals), that a project can use from its own overflow on-demand for each payment terminal.
    @param _terminals Payment terminals to add for the project.

    @return projectId The ID of the project.
  */
  function launchProjectFor(
    address _owner,
    bytes32 _handle,
    string calldata _metadataCid,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints,
    IJBTerminal[] memory _terminals
  ) external returns (uint256 projectId) {
    // The reserved project token rate must be less than or equal to 10000.
    if (_metadata.reservedRate > MAX_TOKEN_RATE) {
      revert INVALID_RESERVED_RATE();
    }
    // The redemption rate must be between 0 and 10000.
    if (_metadata.redemptionRate > MAX_TOKEN_RATE) {
      revert INVALID_REDEMPTION_RATE();
    }

    // The ballot redemption rate must be less than or equal to 10000.
    if (_metadata.ballotRedemptionRate > MAX_TOKEN_RATE) {
      revert INVALID_BALLOT_REDEMPTION_RATE();
    }

    // Create the project for into the wallet of the message sender.
    projectId = projects.createFor(_owner, _handle, _metadataCid);

    // Set the this contract as the project's controller in the directory.
    directory.setControllerOf(projectId, this);

    _configure(projectId, _data, _metadata, _groupedSplits, _fundAccessConstraints);

    // Add the provided terminals to the list of terminals.
    if (_terminals.length > 0) directory.addTerminalsOf(projectId, _terminals);
  }

  /**
    @notice
    Configures the properties of the current funding cycle if the project hasn't distributed tokens yet, or
    sets the properties of the proposed funding cycle that will take effect once the current one expires
    if it is approved by the current funding cycle's ballot.

    @dev
    Only a project's owner or a designated operator can configure its funding cycles.

    @param _projectId The ID of the project whose funding cycles are being reconfigured.
    @param _data A JBFundingCycleData data structure that defines the project's funding cycle that will be queued. These properties will remain fixed for the duration of the funding cycle.
      @dev _data.target The amount that the project wants to payout during a funding cycle. Sent as a wad (18 decimals).
      @dev _data.currency The currency of the `target`. Send 0 for ETH or 1 for USD.
      @dev _data.duration The duration of the funding cycle for which the `target` amount is needed. Measured in days. Send 0 for cycles that are reconfigurable at any time.
      @dev _data.weight The weight of the funding cycle.
        This number is interpreted as a wad, meaning it has 18 decimal places.
        The protocol uses the weight to determine how many tokens to mint upon receiving a payment during a funding cycle.
        A value of 0 means that the weight should be inherited and potentially discounted from the currently active cycle if possible. Otherwise a weight of 0 will be used.
        A value of 1 means that no tokens should be minted regardless of how many ETH was paid. The protocol will set the stored weight value to 0.
        A value of 1 X 10^18 means that one token should be minted per ETH received.
      @dev _data.discountRate A number from 0-1000000000 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
        If it's 0, each funding cycle will have equal weight.
        If the number is 900000000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
      @dev _data.ballot The ballot contract that will be used to approve subsequent reconfigurations. Must adhere to the IFundingCycleBallot interface.
    @param _metadata A JBFundingCycleMetadata data structure specifying the controller specific params that a funding cycle can have. These properties will remain fixed for the duration of the funding cycle.
      @dev _metadata.reservedRate A number from 0-10000 (0-100%) indicating the percentage of each contribution's newly minted tokens that will be reserved for the token splits.
      @dev _metadata.redemptionRate The rate from 0-10000 (0-100%) that tunes the bonding curve according to which a project's tokens can be redeemed for overflow.
        The bonding curve formula is https://www.desmos.com/calculator/sp9ru6zbpk
        where x is _count, o is _currentOverflow, s is _totalSupply, and r is _redemptionRate.
      @dev _metadata.ballotRedemptionRate The redemption rate to apply when there is an active ballot.
      @dev _metadata.pausePay Whether or not the pay functionality should be paused during this cycle.
      @dev _metadata.pauseWithdrawals Whether or not the withdraw functionality should be paused during this cycle.
      @dev _metadata.pauseRedeem Whether or not the redeem functionality should be paused during this cycle.
      @dev _metadata.pauseMint Whether or not the mint functionality should be paused during this cycle.
      @dev _metadata.pauseBurn Whether or not the burn functionality should be paused during this cycle.
      @dev _metadata.allowTerminalMigration Whether or not the terminal migration functionality should be paused during this cycle.
      @dev _metadata.allowControllerMigration Whether or not the controller migration functionality should be paused during this cycle.
      @dev _metadata.holdFees Whether or not fees should be held to be processed at a later time during this cycle.
      @dev _metadata.useDataSourceForPay Whether or not the data source should be used when processing a payment.
      @dev _metadata.useDataSourceForRedeem Whether or not the data source should be used when processing a redemption.
      @dev _metadata.dataSource A contract that exposes data that can be used within pay and redeem transactions. Must adhere to IJBFundingCycleDataSource.
    @param _groupedSplits An array of splits to set for any number of group.
    @param _fundAccessConstraints An array containing amounts, in wei (18 decimals), that a project can use from its own overflow on-demand for each payment terminal.

    @return The configuration of the funding cycle that was successfully reconfigured.
  */
  function reconfigureFundingCyclesOf(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints
  )
    external
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.RECONFIGURE)
    returns (uint256)
  {
    // The reserved project token rate must be less than or equal to 10000.
    if (_metadata.reservedRate > MAX_TOKEN_RATE) {
      revert INVALID_RESERVED_RATE();
    }
    // The redemption rate must be between 0 and 10000.
    if (_metadata.redemptionRate > MAX_TOKEN_RATE) {
      revert INVALID_REDEMPTION_RATE();
    }

    // The ballot redemption rate must be less than or equal to 10000.
    if (_metadata.ballotRedemptionRate > MAX_TOKEN_RATE) {
      revert INVALID_BALLOT_REDEMPTION_RATE();
    }

    return _configure(_projectId, _data, _metadata, _groupedSplits, _fundAccessConstraints);
  }

  /**
    @notice 
    Issues an owner's ERC-20 Tokens that'll be used when claiming tokens.

    @dev 
    Deploys a project's ERC-20 token contract.

    @dev
    Only a project owner or operator can issue its token.

    @param _projectId The ID of the project being issued tokens.
    @param _name The ERC-20's name.
    @param _symbol The ERC-20's symbol.
  */
  function issueTokenFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol
  )
    external
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.ISSUE)
    returns (IJBToken token)
  {
    // Issue the token in the store.
    return tokenStore.issueFor(_projectId, _name, _symbol);
  }

  /**
    @notice 
    Swap the current project's token that is minted and burned for another, and transfer ownership of the current token to another address if needed.

    @dev
    Only a project owner or operator can change its token.

    @param _projectId The ID of the project to which the changed token belongs.
    @param _token The new token.
    @param _newOwner An address to transfer the current token's ownership to. This is optional, but it cannot be done later.
  */
  function changeTokenOf(
    uint256 _projectId,
    IJBToken _token,
    address _newOwner
  )
    external
    nonReentrant
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.CHANGE_TOKEN)
  {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    if (!(_fundingCycle.changeTokenAllowed())) {
      revert JBErrors.NOT_ALLOWED();
    }

    // Change the token in the store.
    tokenStore.changeFor(_projectId, _token, _newOwner);
  }

  /**
    @notice
    Mint new token supply into an account.

    @dev
    Only a project's owner, a designated operator, or one of its terminal's delegate can mint its tokens.

    @param _projectId The ID of the project to which the tokens being minted belong.
    @param _tokenCount The amount of tokens to mint.
    @param _beneficiary The account that the tokens are being minted for.
    @param _memo A memo to pass along to the emitted event.
    @param _preferClaimedTokens A flag indicating whether ERC20's should be minted if they have been issued.
    @param _reservedRate The reserved rate to use when minting tokens. A positive amount will reduce the token count minted to the beneficiary, instead being reserved for preprogrammed splits. This number is out of 10000.

    @return beneficiaryTokenCount The amount of tokens minted for the beneficiary.
  */
  function mintTokensOf(
    uint256 _projectId,
    uint256 _tokenCount,
    address _beneficiary,
    string calldata _memo,
    bool _preferClaimedTokens,
    uint256 _reservedRate
  )
    external
    override
    nonReentrant
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.MINT,
      directory.isTerminalDelegateOf(_projectId, msg.sender)
    )
    returns (uint256 beneficiaryTokenCount)
  {
    // Can't send to the zero address.
    if (_reservedRate != MAX_TOKEN_RATE && _beneficiary == address(0)) {
      revert JBErrors.ZERO_ADDRESS();
    }

    // There should be tokens to mint.
    if (_tokenCount == 0) {
      revert JBErrors.NO_OP();
    }

    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // If the message sender is not a terminal delegate, the current funding cycle must not be paused.
    if (_fundingCycle.mintPaused() && !(directory.isTerminalDelegateOf(_projectId, msg.sender))) {
      revert JBErrors.PAUSED();
    }

    if (_reservedRate == MAX_TOKEN_RATE) {
      // Subtract the total weighted amount from the tracker so the full reserved token amount can be printed later.
      _processedTokenTrackerOf[_projectId] =
        _processedTokenTrackerOf[_projectId] -
        int256(_tokenCount);
    } else {
      // The unreserved token count that will be minted for the beneficiary.
      beneficiaryTokenCount = PRBMath.mulDiv(_tokenCount, MAX_TOKEN_RATE - _reservedRate, MAX_TOKEN_RATE);

      // Mint the tokens.
      tokenStore.mintFor(_beneficiary, _projectId, beneficiaryTokenCount, _preferClaimedTokens);

      if (_reservedRate == 0)
        // If there's no reserved rate, increment the tracker with the newly minted tokens.
        _processedTokenTrackerOf[_projectId] =
          _processedTokenTrackerOf[_projectId] +
          int256(beneficiaryTokenCount);
    }

    emit MintTokens(_beneficiary, _projectId, _tokenCount, _memo, _reservedRate, msg.sender);
  }

  /**
    @notice
    Burns a token holder's supply.

    @dev
    Only a token's holder, a designated operator, or a project's terminal's delegate can burn it.

    @param _holder The account that is having its tokens burned.
    @param _projectId The ID of the project to which the tokens being burned belong.
    @param _tokenCount The number of tokens to burn.
    @param _memo A memo to pass along to the emitted event.
    @param _preferClaimedTokens A flag indicating whether ERC20's should be burned first if they have been issued.
  */
  function burnTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    string calldata _memo,
    bool _preferClaimedTokens
  )
    external
    override
    nonReentrant
    requirePermissionAllowingOverride(
      _holder,
      _projectId,
      JBOperations.BURN,
      directory.isTerminalDelegateOf(_projectId, msg.sender)
    )
  {
    // There should be tokens to burn
    if (_tokenCount == 0) {
      revert JBErrors.NO_OP();
    }
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // If the message sender is not a terminal delegate, the current funding cycle must not be paused.
    if (_fundingCycle.burnPaused() && !(directory.isTerminalDelegateOf(_projectId, msg.sender))) {
      revert JBErrors.PAUSED();
    }

    // Update the token tracker so that reserved tokens will still be correctly mintable.
    _processedTokenTrackerOf[_projectId] =
      _processedTokenTrackerOf[_projectId] -
      int256(_tokenCount);

    // Burn the tokens.
    tokenStore.burnFrom(_holder, _projectId, _tokenCount, _preferClaimedTokens);

    emit BurnTokens(_holder, _projectId, _tokenCount, _memo, msg.sender);
  }

  /**
    @notice
    Distributes all outstanding reserved tokens for a project.

    @param _projectId The ID of the project to which the reserved tokens belong.
    @param _memo A memo to pass along to the emitted event.

    @return The amount of minted reserved tokens.
  */
  function distributeReservedTokensOf(uint256 _projectId, string memory _memo)
    external
    nonReentrant
    returns (uint256)
  {
    return _distributeReservedTokensOf(_projectId, _memo);
  }

  /** 
    @notice
    Allows other controllers to signal to this one that a migration is expected for the specified project.

    @param _projectId The ID of the project that will be migrated to this controller.
  */
  function prepForMigrationOf(uint256 _projectId, IJBController) external override {
    // This controller must not be the project's current controller.
    if (directory.controllerOf(_projectId) == this) {
      revert JBErrors.NO_OP();
    }

    // Set the tracker as the total supply.
    _processedTokenTrackerOf[_projectId] = int256(tokenStore.totalSupplyOf(_projectId));
  }

  /** 
    @notice
    Allows a project to migrate from this controller to another.

    @dev
    Only a project's owner or a designated operator can migrate it.

    @param _projectId The ID of the project that will be migrated from this controller.
    @param _to The controller to which the project is migrating.
  */
  function migrate(uint256 _projectId, IJBController _to)
    external
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.MIGRATE_CONTROLLER)
    nonReentrant
  {
    // This controller must be the project's current controller.
    if (directory.controllerOf(_projectId) != this) {
      revert JBErrors.NO_OP();
    }

    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Migration must be allowed
    if (!_fundingCycle.controllerMigrationAllowed()) {
      revert JBErrors.NOT_ALLOWED();
    }

    // All reserved tokens must be minted before migrating.
    if (uint256(_processedTokenTrackerOf[_projectId]) != tokenStore.totalSupplyOf(_projectId))
      _distributeReservedTokensOf(_projectId, '');

    // Make sure the new controller is prepped for the migration.
    _to.prepForMigrationOf(_projectId, this);

    // Set the new controller.
    directory.setControllerOf(_projectId, _to);

    emit Migrate(_projectId, _to, msg.sender);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice 
    See docs for `distributeReservedTokens`
  */
  function _distributeReservedTokensOf(uint256 _projectId, string memory _memo)
    private
    returns (uint256 count)
  {
    // Get the current funding cycle to read the reserved rate from.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Get a reference to new total supply of tokens before minting reserved tokens.
    uint256 _totalTokens = tokenStore.totalSupplyOf(_projectId);

    // Get a reference to the number of tokens that need to be minted.
    count = _reservedTokenAmountFrom(
      _processedTokenTrackerOf[_projectId],
      _fundingCycle.reservedRate(),
      _totalTokens
    );

    // Set the tracker to be the new total supply.
    _processedTokenTrackerOf[_projectId] = int256(_totalTokens + count);

    // Get a reference to the project owner.
    address _owner = projects.ownerOf(_projectId);

    // Distribute tokens to splits and get a reference to the leftover amount to mint after all splits have gotten their share.
    uint256 _leftoverTokenCount = count == 0
      ? 0
      : _distributeToReservedTokenSplitsOf(_projectId, _fundingCycle, count);

    // Mint any leftover tokens to the project owner.
    if (_leftoverTokenCount > 0) tokenStore.mintFor(_owner, _projectId, _leftoverTokenCount, false);

    emit DistributeReservedTokens(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _owner,
      count,
      _leftoverTokenCount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Distributed tokens to the splits according to the specified funding cycle configuration.

    @param _projectId The ID of the project for which reserved token splits are being distributed.
    @param _fundingCycle The funding cycle to base the token distribution on.
    @param _amount The total amount of tokens to mint.

    @return leftoverAmount If the splits percents dont add up to 100%, the leftover amount is returned.
  */
  function _distributeToReservedTokenSplitsOf(
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _amount
  ) private returns (uint256 leftoverAmount) {
    // Set the leftover amount to the initial amount.
    leftoverAmount = _amount;

    // Get a reference to the project's reserved token splits.
    JBSplit[] memory _splits = splitsStore.splitsOf(
      _projectId,
      _fundingCycle.configuration,
      JBSplitsGroups.RESERVED_TOKENS
    );

    //Transfer between all splits.
    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // Get a reference to the split being iterated on.
      JBSplit memory _split = _splits[_i];

      // The amount to send towards the split. JBSplit percents are out of 10000000.
      uint256 _tokenCount = PRBMath.mulDiv(_amount, _split.percent, 10000000);

      // Mints tokens for the split if needed.
      if (_tokenCount > 0) {
        tokenStore.mintFor(
          // If an allocator is set in the splits, set it as the beneficiary. Otherwise if a projectId is set in the split, set the project's owner as the beneficiary. Otherwise use the split's beneficiary.
          _split.allocator != IJBSplitAllocator(address(0))
            ? address(_split.allocator)
            : _split.projectId != 0
            ? projects.ownerOf(_split.projectId)
            : _split.beneficiary,
          _projectId,
          _tokenCount,
          _split.preferClaimed
        );

        // If there's an allocator set, trigger its `allocate` function.
        if (_split.allocator != IJBSplitAllocator(address(0)))
          _split.allocator.allocate(
            _tokenCount,
            JBSplitsGroups.RESERVED_TOKENS,
            _projectId,
            _split.projectId,
            _split.beneficiary,
            _split.preferClaimed
          );

        // Subtract from the amount to be sent to the beneficiary.
        leftoverAmount = leftoverAmount - _tokenCount;
      }

      emit DistributeToReservedTokenSplit(
        _fundingCycle.configuration,
        _fundingCycle.number,
        _projectId,
        _split,
        _tokenCount,
        msg.sender
      );
    }
  }

  /**
    @notice
    Gets the amount of reserved tokens currently tracked for a project given a reserved rate.

    @param _processedTokenTracker The tracker to make the calculation with.
    @param _reservedRate The reserved rate to use to make the calculation.
    @param _totalEligibleTokens The total amount to make the calculation with.

    @return amount reserved token amount.
  */
  function _reservedTokenAmountFrom(
    int256 _processedTokenTracker,
    uint256 _reservedRate,
    uint256 _totalEligibleTokens
  ) private pure returns (uint256) {
    // Get a reference to the amount of tokens that are unprocessed.
    uint256 _unprocessedTokenBalanceOf = _processedTokenTracker >= 0
      ? _totalEligibleTokens - uint256(_processedTokenTracker)
      : _totalEligibleTokens + uint256(-_processedTokenTracker);

    // If there are no unprocessed tokens, return.
    if (_unprocessedTokenBalanceOf == 0) return 0;

    // If all tokens are reserved, return the full unprocessed amount.
    if (_reservedRate == MAX_TOKEN_RATE) return _unprocessedTokenBalanceOf;

    return
      PRBMath.mulDiv(_unprocessedTokenBalanceOf, MAX_TOKEN_RATE, MAX_TOKEN_RATE - _reservedRate) -
      _unprocessedTokenBalanceOf;
  }

  /** 
    @notice 
    Configures a funding cycle and stores information pertinent to the configuration.

    @dev
    See the docs for `launchProjectFor` and `reconfigureFundingCyclesOf`.
  */
  function _configure(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints
  ) private returns (uint256) {
    // Configure the funding cycle's properties.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.configureFor(
      _projectId,
      _data,
      JBFundingCycleMetadataResolver.packFundingCycleMetadata(_metadata)
    );

    for (uint256 _i; _i < _groupedSplits.length; _i++)
      // Set splits for the current group being iterated on if there are any.
      if (_groupedSplits[_i].splits.length > 0)
        splitsStore.set(
          _projectId,
          _fundingCycle.configuration,
          _groupedSplits[_i].group,
          _groupedSplits[_i].splits
        );

    // Set overflow allowances if there are any.
    for (uint256 _i; _i < _fundAccessConstraints.length; _i++) {
      JBFundAccessConstraints memory _constraints = _fundAccessConstraints[_i];

      // Set the distribution limit if there is one.
      if (_constraints.distributionLimit > 0)
        distributionLimitOf[_projectId][_fundingCycle.configuration][
          _constraints.terminal
        ] = _constraints.distributionLimit;

      // Set the overflow allowance if there is one.
      if (_constraints.overflowAllowance > 0)
        overflowAllowanceOf[_projectId][_fundingCycle.configuration][
          _constraints.terminal
        ] = _constraints.overflowAllowance;

      if (_constraints.currency > 0)
        currencyOf[_projectId][_fundingCycle.configuration][_constraints.terminal] = _constraints
          .currency;

      emit SetFundAccessConstraints(
        _fundingCycle.configuration,
        _fundingCycle.number,
        _projectId,
        _constraints,
        msg.sender
      );
    }

    return _fundingCycle.configuration;
  }
}
