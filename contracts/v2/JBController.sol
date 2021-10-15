// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

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
import './structs/JBOverflowAllowance.sol';

// Inheritance
import './interfaces/IJBController.sol';
import './abstract/JBOperatable.sol';
import './abstract/JBTerminalUtility.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

/**
  @notice
  Stitches together funding cycles and treasury tokens, making sure all activity is accounted for and correct.

  @dev 
  A project can transfer control from this contract to another allowed controller contract at any time.

  Inherits from:

  IJBController - general interface for the generic controller methods in this contract that interacts with funding cycles and tokens according to the Juicebox protocol's rules.
  JBOperatable - several functions in this contract can only be accessed by a project owner, or an address that has been preconfifigured to be an operator of the project.
  Ownable - includes convenience functionality for specifying an address that owns the contract, with modifiers that only allow access by the owner.
  ReentrencyGuard - several function in this contract shouldn't be accessible recursively.
*/
contract JBController is IJBController, JBTerminalUtility, JBOperatable, Ownable, ReentrancyGuard {
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  event SetOverflowAllowance(
    uint256 indexed projectId,
    uint256 indexed configuration,
    JBOverflowAllowance allowance,
    address caller
  );
  event DistributeReservedTokens(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    address indexed beneficiary,
    uint256 count,
    uint256 projectOwnerTokenCount,
    string memo,
    address caller
  );

  event DistributeToReservedTokenSplit(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    JBSplit split,
    uint256 tokenCount,
    address caller
  );

  event MintTokens(
    address indexed beneficiary,
    uint256 indexed projectId,
    uint256 indexed count,
    string memo,
    bool shouldReserveTokens,
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
    The difference between the processed token tracker of a project and the project's token's total supply is the amount of tokens that
    still need to have reserves minted against them.
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
    The amount of overflow that a project is allowed to tap into on-demand.

    @dev
    [_projectId][_configuration][_terminal]

    _projectId The ID of the project to get the current overflow allowance of.
    _configuration The configuration of the during which the allowance applies.
    _terminal The terminal managing the overflow.

    @return The current overflow allowance for the specified project configuration. Decreases as projects use of the allowance.
  */
  mapping(uint256 => mapping(uint256 => mapping(IJBTerminal => uint256)))
    public
    override overflowAllowanceOf;

  /** 
    @notice 
    The platform fee percent.

    @dev 
    Out of 200.
  */
  uint256 public fee = 10;

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
    Creates a project. This will mint an ERC-721 into the message sender's account, configure a first funding cycle, and set up any splits.

    @dev
    Each operation withing this transaction can be done in sequence separately.

    @dev
    Anyone can deploy a project on an owner's behalf.

    @dev 
    A project owner will be able to reconfigure the funding cycle's properties as long as it has not yet received a payment.

    @param _handle The project's unique handle. This can be updated any time by the owner of the project.
    @param _uri A link to associate with the project. This can be updated any time by the owner of the project.
    @param _data The funding cycle configuration data. These properties will remain fixed for the duration of the funding cycle.
      @dev _data.target The amount that the project wants to payout during a funding cycle. Sent as a wad (18 decimals).
      @dev _data.currency The currency of the `target`. Send 0 for ETH or 1 for USD.
      @dev _data.duration The duration of the funding cycle for which the `target` amount is needed. Measured in days. Send 0 for cycles that are reconfigurable at any time.
      @dev _data.discountRate A number from 0-10000 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
        If it's 0, each funding cycle will have equal weight.
        If the number is 9000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
        If the number is 10001, an non-recurring funding cycle will get made.
      @dev _data.ballot The ballot contract that will be used to approve subsequent reconfigurations. Must adhere to the IFundingCycleBallot interface.
    @param _metadata A struct specifying the TerminalV2 specific params that a funding cycle can have.
      @dev _metadata.reservedRate A number from 0-200 (0-100%) indicating the percentage of each contribution's newly minted tokens that will be reserved for the token splits.
      @dev _metadata.redemptionRate The rate from 0-200 (0-100%) that tunes the bonding curve according to which a project's tokens can be redeemed for overflow.
        The bonding curve formula is https://www.desmos.com/calculator/sp9ru6zbpk
        where x is _count, o is _currentOverflow, s is _totalSupply, and r is _redemptionRate.
      @dev _metadata.ballotRedemptionRate The redemption rate to apply when there is an active ballot.
      @dev _metadata.pausePay Whether or not the pay functionality should be paused during this cycle.
      @dev _metadata.pauseWithdraw Whether or not the withdraw functionality should be paused during this cycle.
      @dev _metadata.pauseRedeem Whether or not the redeem functionality should be paused during this cycle.
      @dev _metadata.pauseMint Whether or not the mint functionality should be paused during this cycle.
      @dev _metadata.pauseBurn Whether or not the burn functionality should be paused during this cycle.
      @dev _metadata.useDataSourceForPay Whether or not the data source should be used when processing a payment.
      @dev _metadata.useDataSourceForRedeem Whether or not the data source should be used when processing a redemption.
      @dev _metadata.dataSource A contract that exposes data that can be used within pay and redeem transactions. Must adhere to IJBFundingCycleDataSource.
    @param _overflowAllowances The amount, in wei (18 decimals), of ETH that a project can use from its own overflow on-demand.
    @param _payoutSplits Any payout splits to set.
    @param _reservedTokenSplits Any reserved token splits to set.
  */
  function launchProjectFor(
    bytes32 _handle,
    string calldata _uri,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBOverflowAllowance[] memory _overflowAllowances,
    JBSplit[] memory _payoutSplits,
    JBSplit[] memory _reservedTokenSplits,
    IJBTerminal _terminal
  ) external {
    // Make sure the metadata is validated and packed into a uint256.
    uint256 _packedMetadata = _validateAndPackFundingCycleMetadata(_metadata);

    // Create the project for into the wallet of the message sender.
    uint256 _projectId = projects.createFor(msg.sender, _handle, _uri);

    // Set the this contract as the project's controller in the directory.
    directory.setControllerOf(_projectId, this);

    // Add the provided terminal to the list of terminals.
    if (_terminal != IJBTerminal(address(0))) directory.addTerminalOf(_projectId, _terminal);

    _configure(
      _projectId,
      _data,
      _packedMetadata,
      _overflowAllowances,
      _payoutSplits,
      _reservedTokenSplits,
      true
    );
  }

  /**
    @notice
    Configures the properties of the current funding cycle if the project hasn't distributed tokens yet, or
    sets the properties of the proposed funding cycle that will take effect once the current one expires
    if it is approved by the current funding cycle's ballot.

    @dev
    Only a project's owner or a designated operator can configure its funding cycles.

    @param _projectId The ID of the project whos funding cycles are being reconfigured.
    @param _data The funding cycle configuration data. These properties will remain fixed for the duration of the funding cycle.
      @dev _data.target The amount that the project wants to payout during a funding cycle. Sent as a wad (18 decimals).
      @dev _data.currency The currency of the `target`. Send 0 for ETH or 1 for USD.
      @dev _data.duration The duration of the funding cycle for which the `target` amount is needed. Measured in days. Send 0 for cycles that are reconfigurable at any time.
      @dev _data.discountRate A number from 0-10000 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
        If it's 0, each funding cycle will have equal weight.
        If the number is 9000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
        If the number is 10001, an non-recurring funding cycle will get made.
      @dev _data.ballot The ballot contract that will be used to approve subsequent reconfigurations. Must adhere to the IFundingCycleBallot interface.
    @param _metadata A struct specifying the TerminalV2 specific params that a funding cycle can have.
      @dev _metadata.reservedRate A number from 0-200 (0-100%) indicating the percentage of each contribution's newly minted tokens that will be reserved for the token splits.
      @dev _metadata.redemptionRate The rate from 0-200 (0-100%) that tunes the bonding curve according to which a project's tokens can be redeemed for overflow.
        The bonding curve formula is https://www.desmos.com/calculator/sp9ru6zbpk
        where x is _count, o is _currentOverflow, s is _totalSupply, and r is _redemptionRate.
      @dev _metadata.ballotRedemptionRate The redemption rate to apply when there is an active ballot.
      @dev _metadata.pausePay Whether or not the pay functionality should be paused during this cycle.
      @dev _metadata.pauseWithdraw Whether or not the withdraw functionality should be paused during this cycle.
      @dev _metadata.pauseRedeem Whether or not the redeem functionality should be paused during this cycle.
      @dev _metadata.pauseMint Whether or not the mint functionality should be paused during this cycle.
      @dev _metadata.pauseBurn Whether or not the burn functionality should be paused during this cycle.
      @dev _metadata.useDataSourceForPay Whether or not the data source should be used when processing a payment.
      @dev _metadata.useDataSourceForRedeem Whether or not the data source should be used when processing a redemption.
      @dev _metadata.dataSource A contract that exposes data that can be used within pay and redeem transactions. Must adhere to IJBFundingCycleDataSource.
    @param _overflowAllowances The amount, in wei (18 decimals), of ETH that a project can use from its own overflow on-demand.
    @param _payoutSplits Any payout splits to set.
    @param _reservedTokenSplits Any reserved token splits to set.

    @return The ID of the funding cycle that was successfully configured.
  */
  function reconfigureFundingCyclesOf(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBOverflowAllowance[] memory _overflowAllowances,
    JBSplit[] memory _payoutSplits,
    JBSplit[] memory _reservedTokenSplits
  )
    external
    nonReentrant
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.RECONFIGURE)
    returns (uint256)
  {
    // Make sure the metadata is validated and packed into a uint256.
    uint256 _packedMetadata = _validateAndPackFundingCycleMetadata(_metadata);

    // All reserved tokens must be minted before configuring.
    if (uint256(_processedTokenTrackerOf[_projectId]) != tokenStore.totalSupplyOf(_projectId))
      _distributeReservedTokensOf(_projectId, '');

    // Set the this contract as the project's controller in the directory if its not already set.
    if (address(directory.controllerOf(_projectId)) == address(0))
      directory.setControllerOf(_projectId, this);

    // Configure the active project if its tokens have yet to be minted.
    bool _shouldConfigureActive = tokenStore.totalSupplyOf(_projectId) == 0;

    return
      _configure(
        _projectId,
        _data,
        _packedMetadata,
        _overflowAllowances,
        _payoutSplits,
        _reservedTokenSplits,
        _shouldConfigureActive
      );
  }

  /**
    @notice
    Signals that a project's funds are being withdrawn.

    @dev
    Only a project's terminal can signal a withdrawal.

    @param _projectId The ID of the project that is being withdrawn from.
    @param _amount The amount to withdraw.
  */
  function signalWithdrawlFrom(uint256 _projectId, uint256 _amount)
    external
    override
    onlyTerminal(_projectId)
    returns (JBFundingCycle memory)
  {
    // Tap from the project's funding cycle.
    return fundingCycleStore.tapFrom(_projectId, _amount);
  }

  /**
    @notice
    Mint new token supply into an account.

    @dev
    Only a project's owner or a designated operator can mint it.

    @param _projectId The ID of the project to which the tokens being burned belong.
    @param _tokenCount The amount of tokens to mint.
    @param _beneficiary The account that the tokens are being minted for.
    @param _memo A memo to pass along to the emitted event.
    @param _preferClaimedTokens Whether ERC20's should be burned first if they have been issued.
  */
  function mintTokensOf(
    uint256 _projectId,
    uint256 _tokenCount,
    address _beneficiary,
    string calldata _memo,
    bool _preferClaimedTokens,
    bool _shouldReserveTokens
  )
    external
    override
    nonReentrant
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.MINT,
      directory.isTerminalOf(_projectId, msg.sender)
    )
  {
    // Can't send to the zero address.
    require(_beneficiary != address(0), 'ZERO_ADDRESS');

    // There should be tokens to mint.
    require(_tokenCount > 0, 'NO_OP');

    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    require(_fundingCycle.mintPaused(), 'PAUSED');

    if (_shouldReserveTokens && _fundingCycle.reservedRate() == 200) {
      // Subtract the total weighted amount from the tracker so the full reserved token amount can be printed later.
      _processedTokenTrackerOf[_projectId] =
        _processedTokenTrackerOf[_projectId] -
        int256(_tokenCount);
    } else {
      // Redeem the tokens, which burns them.
      tokenStore.mintFor(_beneficiary, _projectId, _tokenCount, _preferClaimedTokens);

      if (!_shouldReserveTokens)
        // Set the minted tokens as processed so that reserved tokens cant be minted against them.
        _processedTokenTrackerOf[_projectId] =
          _processedTokenTrackerOf[_projectId] +
          int256(_tokenCount);
    }

    emit MintTokens(_beneficiary, _projectId, _tokenCount, _memo, _shouldReserveTokens, msg.sender);
  }

  /**
    @notice
    Burns a token holder's supply.

    @dev
    Only a token's holder or a designated operator can burn it.

    @param _holder The account that is having its tokens burned.
    @param _projectId The ID of the project to which the tokens being burned belong.
    @param _tokenCount The number of tokens to burn.
    @param _memo A memo to pass along to the emitted event.
    @param _preferClaimedTokens Whether ERC20's should be burned first if they have been issued.
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
      directory.isTerminalOf(_projectId, msg.sender)
    )
  {
    // There should be tokens to burn
    require(_tokenCount > 0, 'NO_OP');

    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    require(_fundingCycle.burnPaused(), 'PAUSED');

    // Update the token tracker so that reserved tokens will still be correctly mintable.
    _subtractFromTokenTrackerOf(_projectId, _tokenCount);

    // Burn the tokens.
    tokenStore.burnFrom(_holder, _projectId, _tokenCount, _preferClaimedTokens);

    emit BurnTokens(_holder, _projectId, _tokenCount, _memo, msg.sender);
  }

  /**
    @notice
    Mints and distributes all outstanding reserved tokens for a project.

    @param _projectId The ID of the project to which the reserved tokens belong.
    @param _memo A memo to leave with the emitted event.

    @return The amount of reserved tokens that were minted.
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
    Allows a terminal to signal to the controller that it is getting replaced by a new terminal.

    @param _projectId The ID of the project that is swapping terminals.
    @param _terminal The terminal that is being swapped to.
  */
  function swapTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    onlyTerminal(_projectId)
  {
    // Remove the current terminal.
    directory.removeTerminalOf(_projectId, IJBTerminal(msg.sender));

    // Add the new terminal.
    directory.addTerminalOf(_projectId, _terminal);
  }

  /** 
    @notice
    Allows other controllers to signal to this one that a migration is expected for the specified project.

    @param _projectId The ID of the project that will be migrated to this controller.
  */
  function prepForMigrationOf(uint256 _projectId, IJBController) external override {
    // This controller must not be the project's current controller.
    require(directory.controllerOf(_projectId) != this, 'UNAUTHORIZED');

    // Set the tracker as the total supply.
    _processedTokenTrackerOf[_projectId] = int256(tokenStore.totalSupplyOf(_projectId));
  }

  /** 
    @notice
    Allows a project to migrate from this controller to another.

    @param _projectId The ID of the project that will be migrated to this controller.
  */
  function migrate(uint256 _projectId, IJBController _to)
    external
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.MIGRATE_CONTROLLER)
    nonReentrant
  {
    // This controller must be the project's current controller.
    require(directory.controllerOf(_projectId) == this, 'UNAUTHORIZED');

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
    Validate and pack the funding cycle metadata.

    @param _metadata The metadata to validate and pack.

    @return packed The packed uint256 of all metadata params. The first 8 bytes specify the version.
    */
  function _validateAndPackFundingCycleMetadata(JBFundingCycleMetadata memory _metadata)
    private
    pure
    returns (uint256 packed)
  {
    // The reserved project token rate must be less than or equal to 200.
    require(_metadata.reservedRate <= 200, 'BAD_RESERVED_RATE');

    // The redemption rate must be between 0 and 200.
    require(_metadata.redemptionRate <= 200, 'BAD_REDEMPTION_RATE');

    // The ballot redemption rate must be less than or equal to 200.
    require(_metadata.ballotRedemptionRate <= 200, 'BAD_BALLOT_REDEMPTION_RATE');

    // version 1 in the first 8 bytes.
    packed = 1;
    // reserved rate in bits 8-15.
    packed |= _metadata.reservedRate << 8;
    // bonding curve in bits 16-23.
    packed |= _metadata.redemptionRate << 16;
    // reconfiguration bonding curve rate in bits 24-31.
    packed |= _metadata.ballotRedemptionRate << 24;
    // pause pay in bit 32.
    packed |= (_metadata.pausePay ? 1 : 0) << 32;
    // pause tap in bit 33.
    packed |= (_metadata.pauseWithdraw ? 1 : 0) << 33;
    // pause redeem in bit 34.
    packed |= (_metadata.pauseRedeem ? 1 : 0) << 34;
    // pause mint in bit 35.
    packed |= (_metadata.pauseMint ? 1 : 0) << 35;
    // pause mint in bit 36.
    packed |= (_metadata.pauseBurn ? 1 : 0) << 36;
    // use pay data source in bit 37.
    packed |= (_metadata.useDataSourceForPay ? 1 : 0) << 37;
    // use redeem data source in bit 38.
    packed |= (_metadata.useDataSourceForRedeem ? 1 : 0) << 38;
    // data source address in bits 39-198.
    packed |= uint160(address(_metadata.dataSource)) << 39;
  }

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

    // There aren't any reserved tokens to mint and distribute if there is no funding cycle.
    if (_fundingCycle.number == 0) return 0;

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
      : _distributeToReservedTokenSplitsOf(_fundingCycle, count);

    // Mint any leftover tokens to the project owner.
    if (_leftoverTokenCount > 0) tokenStore.mintFor(_owner, _projectId, _leftoverTokenCount, false);

    emit DistributeReservedTokens(
      _fundingCycle.id,
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

    @param _fundingCycle The funding cycle to base the token distribution on.
    @param _amount The total amount of tokens to mint.

    @return leftoverAmount If the splits percents dont add up to 100%, the leftover amount is returned.
  */
  function _distributeToReservedTokenSplitsOf(JBFundingCycle memory _fundingCycle, uint256 _amount)
    private
    returns (uint256 leftoverAmount)
  {
    // Set the leftover amount to the initial amount.
    leftoverAmount = _amount;

    // Get a reference to the project's reserved token splits.
    JBSplit[] memory _splits = splitsStore.splitsOf(
      _fundingCycle.projectId,
      _fundingCycle.configured,
      JBSplitsGroups.RESERVED_TOKENS
    );

    //Transfer between all splits.
    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // Get a reference to the split being iterated on.
      JBSplit memory _split = _splits[_i];

      // The amount to send towards the split. JBSplit percents are out of 10000.
      uint256 _tokenCount = PRBMath.mulDiv(_amount, _split.percent, 10000);

      // Mints tokens for the split if needed.
      if (_tokenCount > 0)
        tokenStore.mintFor(
          // If a projectId is set in the split, set the project's owner as the beneficiary.
          // Otherwise use the split's beneficiary.
          _split.projectId != 0 ? projects.ownerOf(_split.projectId) : _split.beneficiary,
          _fundingCycle.projectId,
          _tokenCount,
          _split.preferUnstaked
        );

      // If there's an allocator set, trigger its `allocate` function.
      if (_split.allocator != IJBSplitAllocator(address(0)))
        _split.allocator.allocate(
          _tokenCount,
          2,
          _fundingCycle.projectId,
          _split.projectId,
          _split.beneficiary,
          _split.preferUnstaked
        );

      // Subtract from the amount to be sent to the beneficiary.
      leftoverAmount = leftoverAmount - _tokenCount;

      emit DistributeToReservedTokenSplit(
        _fundingCycle.id,
        _fundingCycle.projectId,
        _split,
        _tokenCount,
        msg.sender
      );
    }
  }

  /** 
    @notice
    Subtracts the provided value from the processed token tracker.

    @dev
    Necessary to account for both positive and negative values.

    @param _projectId The ID of the project that is having its tracker subtracted from.
    @param _amount The amount to subtract.

  */
  function _subtractFromTokenTrackerOf(uint256 _projectId, uint256 _amount) private {
    // Get a reference to the processed token tracker for the project.
    int256 _processedTokenTracker = _processedTokenTrackerOf[_projectId];

    // Subtract the count from the processed token tracker.
    // If there are at least as many processed tokens as the specified amount,
    // the processed token tracker of the project will be positive. Otherwise it will be negative.
    _processedTokenTrackerOf[_projectId] = _processedTokenTracker < 0 // If the tracker is negative, add the count and reverse it.
      ? -int256(uint256(-_processedTokenTracker) + _amount) // the tracker is less than the count, subtract it from the count and reverse it.
      : _processedTokenTracker < int256(_amount)
      ? -(int256(_amount) - _processedTokenTracker) // simply subtract otherwise.
      : _processedTokenTracker - int256(_amount);
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
    uint256 _unprocessedTokenBalanceOf = _processedTokenTracker >= 0 // preconfigure tokens shouldn't contribute to the reserved token amount.
      ? _totalEligibleTokens - uint256(_processedTokenTracker)
      : _totalEligibleTokens + uint256(-_processedTokenTracker);

    // If there are no unprocessed tokens, return.
    if (_unprocessedTokenBalanceOf == 0) return 0;

    // If all tokens are reserved, return the full unprocessed amount.
    if (_reservedRate == 200) return _unprocessedTokenBalanceOf;

    return
      PRBMath.mulDiv(_unprocessedTokenBalanceOf, 200, 200 - _reservedRate) -
      _unprocessedTokenBalanceOf;
  }

  /** 
    @notice 
    Configures a funding cycle and stores information pertinent to the configuration.

    @dev
    See the docs for `launchProject` and `configureFundingCycles`.
  */
  function _configure(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    uint256 _packedMetadata,
    JBOverflowAllowance[] memory _overflowAllowances,
    JBSplit[] memory _payoutSplits,
    JBSplit[] memory _reservedTokenSplits,
    bool _shouldConfigureActive
  ) private returns (uint256) {
    // Configure the funding cycle's properties.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.configureFor(
      _projectId,
      _data,
      _packedMetadata,
      fee,
      _shouldConfigureActive
    );

    // Set payout splits if there are any.
    if (_payoutSplits.length > 0)
      splitsStore.set(
        _projectId,
        _fundingCycle.configured,
        JBSplitsGroups.ETH_PAYOUT,
        _payoutSplits
      );

    // Set token splits if there are any.
    if (_reservedTokenSplits.length > 0)
      splitsStore.set(
        _projectId,
        _fundingCycle.configured,
        JBSplitsGroups.RESERVED_TOKENS,
        _reservedTokenSplits
      );

    for (uint256 _i; _i < _overflowAllowances.length; _i++) {
      JBOverflowAllowance memory _allowance = _overflowAllowances[_i];

      // Set the overflow allowance if the value is different from the currently set value.
      if (
        _allowance.amount !=
        overflowAllowanceOf[_projectId][_fundingCycle.configured][_allowance.terminal]
      ) {
        overflowAllowanceOf[_projectId][_fundingCycle.configured][_allowance.terminal] = _allowance
          .amount;

        emit SetOverflowAllowance(_projectId, _fundingCycle.configured, _allowance, msg.sender);
      }
    }

    return _fundingCycle.id;
  }
}
