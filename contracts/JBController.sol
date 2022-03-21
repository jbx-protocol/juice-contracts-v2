// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import './abstract/JBOperatable.sol';
import './interfaces/IJBProjects.sol';
import './interfaces/IJBPaymentTerminal.sol';
import './interfaces/IJBOperatorStore.sol';
import './interfaces/IJBFundingCycleDataSource.sol';
import './interfaces/IJBPrices.sol';
import './interfaces/IJBController.sol';
import './interfaces/IJBController.sol';
import './libraries/JBConstants.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_DISTRIBUTION_LIMIT();
error INVALID_DISTRIBUTION_LIMIT_CURRENCY();
error INVALID_OVERFLOW_ALLOWANCE();
error INVALID_OVERFLOW_ALLOWANCE_CURRENCY();
error BURN_PAUSED_AND_SENDER_NOT_VALID_TERMINAL_DELEGATE();
error NOT_CURRENT_CONTROLLER();
error CANT_MIGRATE_TO_CURRENT_CONTROLLER();
error CHANGE_TOKEN_NOT_ALLOWED();
error FUNDING_CYCLE_ALREADY_LAUNCHED();
error INVALID_BALLOT_REDEMPTION_RATE();
error INVALID_RESERVED_RATE();
error INVALID_REDEMPTION_RATE();
error MIGRATION_NOT_ALLOWED();
error MINT_PAUSED_AND_NOT_TERMINAL_DELEGATE();
error NO_BURNABLE_TOKENS();
error ZERO_TOKENS_TO_MINT();

/**
  @notice
  Stitches together funding cycles and community tokens, making sure all activity is accounted for and correct.

  @dev
  Adheres to:
  IJBController - general interface for the generic controller methods in this contract that interacts with funding cycles and tokens according to the protocol's rules.

  @dev
  Inherits from:
  JBOperatable - several functions in this contract can only be accessed by a project owner, or an address that has been preconfifigured to be an operator of the project.
  ReentrencyGuard - several function in this contract shouldn't be accessible recursively.
*/
contract JBController is IJBController, JBOperatable {
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /**
    @notice
    The difference between the processed token tracker of a project and the project's token's total supply is the amount of tokens that still need to have reserves minted against them.

    _projectId The ID of the project to get the tracker of.
  */
  mapping(uint256 => int256) private _processedTokenTrackerOf;

  /**
    @notice
    Data regarding the distribution limit of a project during a configuration.

    @dev
    bits 0-247: The amount of token that a project can distribute per funding cycle.

    @dev
    bits 248-255: The currency of amount that a project can distribute.

    _projectId The ID of the project to get the packed distribution limit data of.
    _configuration The configuration during which the packed distribution limit data applies.
    _terminal The terminal from which distributions are being limited.
  */
  mapping(uint256 => mapping(uint256 => mapping(IJBPaymentTerminal => uint256)))
    private _packedDistributionLimitDataOf;

  /**
    @notice
    Data regarding the overflow allowance of a project during a configuration.

    @dev
    bits 0-247: The amount of overflow that a project is allowed to tap into on-demand throughout the configuration.

    @dev
    bits 248-255: The currency of the amount of overflow that a project is allowed to tap.

    _projectId The ID of the project to get the packed overflow allowance data of.
    _configuration The configuration during which the packed overflow allowance data applies.
    _terminal The terminal managing the overflow.
  */
  mapping(uint256 => mapping(uint256 => mapping(IJBPaymentTerminal => uint256)))
    private _packedOverflowAllowanceDataOf;

  //*********************************************************************//
  // --------------- public immutable stored properties ---------------- //
  //*********************************************************************//

  /**
    @notice
    The Projects contract which mints ERC-721's that represent project ownership.
  */
  IJBProjects public immutable override projects;

  /**
    @notice
    The contract storing all funding cycle configurations.
  */
  IJBFundingCycleStore public immutable override fundingCycleStore;

  /**
    @notice
    The contract that manages token minting and burning.
  */
  IJBTokenStore public immutable override tokenStore;

  /**
    @notice
    The contract that stores splits for each project.
  */
  IJBSplitsStore public immutable override splitsStore;

  /**
    @notice
    The directory of terminals and controllers for projects.
  */
  IJBDirectory public immutable override directory;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    The amount of token that a project can distribute per funding cycle, and the currency it's in terms of.

    @dev
    The number of decimals in the returned fixed point amount is the same as that of the specified terminal. 

    @param _projectId The ID of the project to get the distribution limit of.
    @param _configuration The configuration during which the distribution limit applies.
    @param _terminal The terminal from which distributions are being limited.

    @return The distribution limit, as a fixed point number with the same number of decimals as the provided terminal.
    @return The currency of the distribution limit.
  */
  function distributionLimitOf(
    uint256 _projectId,
    uint256 _configuration,
    IJBPaymentTerminal _terminal
  ) external view override returns (uint256, uint256) {
    // Get a reference to the packed data.
    uint256 _data = _packedDistributionLimitDataOf[_projectId][_configuration][_terminal];

    // The limit is in bits 0-247. The currency is in bits 248-255.
    return (uint256(uint248(_data)), _data >> 248);
  }

  /**
    @notice
    The amount of overflow that a project is allowed to tap into on-demand throughout a configuration, and the currency it's in terms of.

    @dev
    The number of decimals in the returned fixed point amount is the same as that of the specified terminal. 

    @param _projectId The ID of the project to get the overflow allowance of.
    @param _configuration The configuration of the during which the allowance applies.
    @param _terminal The terminal managing the overflow.

    @return The overflow allowance, as a fixed point number with the same number of decimals as the provided terminal.
    @return The currency of the overflow allowance.
  */
  function overflowAllowanceOf(
    uint256 _projectId,
    uint256 _configuration,
    IJBPaymentTerminal _terminal
  ) external view override returns (uint256, uint256) {
    // Get a reference to the packed data.
    uint256 _data = _packedOverflowAllowanceDataOf[_projectId][_configuration][_terminal];

    // The allowance is in bits 0-247. The currency is in bits 248-255.
    return (uint256(uint248(_data)), _data >> 248);
  }

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
  ) JBOperatable(_operatorStore) {
    projects = _projects;
    directory = _directory;
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
    @param _projectMetadata Metadata to associate with the project within a particular domain. This can be updated any time by the owner of the project.
    @param _data Data that defines the project's first funding cycle. These properties will remain fixed for the duration of the funding cycle.
    @param _metadata Metadata specifying the controller specific params that a funding cycle can have. These properties will remain fixed for the duration of the funding cycle.
    @param _mustStartAtOrAfter The time before which the configured funding cycle cannot start.
    @param _groupedSplits An array of splits to set for any number of groups. 
    @param _fundAccessConstraints An array containing amounts that a project can use from its treasury for each payment terminal. Amounts are fixed point numbers using the same number of decimals as the accompanying terminal.
    @param _terminals Payment terminals to add for the project.
    @param _memo A memo to pass along to the emitted event.

    @return projectId The ID of the project.
  */
  function launchProjectFor(
    address _owner,
    JBProjectMetadata calldata _projectMetadata,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints,
    IJBPaymentTerminal[] memory _terminals,
    string calldata _memo
  ) external override returns (uint256 projectId) {
    // Mint the project into the wallet of the message sender.
    projectId = projects.createFor(_owner, _projectMetadata);

    // Set this contract as the project's controller in the directory.
    directory.setControllerOf(projectId, this);

    // Configure the first funding cycle.
    uint256 _configuration = _configure(
      projectId,
      _data,
      _metadata,
      _mustStartAtOrAfter,
      _groupedSplits,
      _fundAccessConstraints
    );

    // Add the provided terminals to the list of terminals.
    if (_terminals.length > 0) directory.setTerminalsOf(projectId, _terminals);

    emit LaunchProject(_configuration, projectId, _memo, msg.sender);
  }

  /**
    @notice
    Creates a funding cycle for an already existing project ERC-721.

    @dev
    Each operation within this transaction can be done in sequence separately.

    @dev
    Only a project owner or operator can launch its funding cycles.

    @param _projectId The ID of the project to launch funding cycles for.
    @param _data Data that defines the project's first funding cycle. These properties will remain fixed for the duration of the funding cycle.
    @param _metadata Metadata specifying the controller specific params that a funding cycle can have. These properties will remain fixed for the duration of the funding cycle.
    @param _mustStartAtOrAfter The time before which the configured funding cycle cannot start.
    @param _groupedSplits An array of splits to set for any number of groups. 
    @param _fundAccessConstraints An array containing amounts that a project can use from its treasury for each payment terminal. Amounts are fixed point numbers using the same number of decimals as the accompanying terminal.
    @param _terminals Payment terminals to add for the project.
    @param _memo A memo to pass along to the emitted event.

    @return configuration The configuration of the funding cycle that was successfully created.
  */
  function launchFundingCyclesFor(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints,
    IJBPaymentTerminal[] memory _terminals,
    string calldata _memo
  )
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.RECONFIGURE)
    returns (uint256 configuration)
  {
    // If there is a previous configuration, reconfigureFundingCyclesOf should be called instead
    if (fundingCycleStore.latestConfigurationOf(_projectId) > 0)
      revert FUNDING_CYCLE_ALREADY_LAUNCHED();

    // Set this contract as the project's controller in the directory.
    directory.setControllerOf(_projectId, this);

    // Configure the first funding cycle.
    configuration = _configure(
      _projectId,
      _data,
      _metadata,
      _mustStartAtOrAfter,
      _groupedSplits,
      _fundAccessConstraints
    );

    // Add the provided terminals to the list of terminals.
    if (_terminals.length > 0) directory.setTerminalsOf(_projectId, _terminals);

    emit LaunchFundingCycles(configuration, _projectId, _memo, msg.sender);
  }

  /**
    @notice
    Proposes a configuration of a subsequent funding cycle that will take effect once the current one expires if it is approved by the current funding cycle's ballot.

    @dev
    Only a project's owner or a designated operator can configure its funding cycles.

    @param _projectId The ID of the project whose funding cycles are being reconfigured.
    @param _data Data that defines the funding cycle. These properties will remain fixed for the duration of the funding cycle.
    @param _metadata Metadata specifying the controller specific params that a funding cycle can have. These properties will remain fixed for the duration of the funding cycle.
    @param _mustStartAtOrAfter The time before which the configured funding cycle cannot start.
    @param _groupedSplits An array of splits to set for any number of groups. 
    @param _fundAccessConstraints An array containing amounts that a project can use from its treasury for each payment terminal. Amounts are fixed point numbers using the same number of decimals as the accompanying terminal.
    @param _memo A memo to pass along to the emitted event.

    @return configuration The configuration of the funding cycle that was successfully reconfigured.
  */
  function reconfigureFundingCyclesOf(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints,
    string calldata _memo
  )
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.RECONFIGURE)
    returns (uint256 configuration)
  {
    // Configure the next funding cycle.
    configuration = _configure(
      _projectId,
      _data,
      _metadata,
      _mustStartAtOrAfter,
      _groupedSplits,
      _fundAccessConstraints
    );

    emit ReconfigureFundingCycles(configuration, _projectId, _memo, msg.sender);
  }

  /**
    @notice
    Issues an owner's ERC20 JBTokens that'll be used when claiming tokens.

    @dev
    Deploys a project's ERC20 JBToken contract.

    @dev
    Only a project's owner or operator can issue its token.

    @param _projectId The ID of the project being issued tokens.
    @param _name The ERC20's name.
    @param _symbol The ERC20's symbol.
  */
  function issueTokenFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol
  )
    external
    override
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
    Only a project's owner or operator can change its token.

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
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.CHANGE_TOKEN)
  {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    if (!_fundingCycle.changeTokenAllowed()) revert CHANGE_TOKEN_NOT_ALLOWED();

    // Change the token in the store.
    tokenStore.changeFor(_projectId, _token, _newOwner);
  }

  /**
    @notice
    Mint new token supply into an account, and optionally reserve a supply to be distributed according to the project's current funding cycle configuration.

    @dev
    Only a project's owner, a designated operator, or one of its terminals can mint its tokens.

    @param _projectId The ID of the project to which the tokens being minted belong.
    @param _tokenCount The amount of tokens to mint in total, counting however many should be reserved.
    @param _beneficiary The account that the tokens are being minted for.
    @param _memo A memo to pass along to the emitted event.
    @param _preferClaimedTokens A flag indicating whether a project's attached token contract should be minted if they have been issued.
    @param _useReservedRate Whether to use the current funding cycle's reserved rate in the mint calculation.

    @return beneficiaryTokenCount The amount of tokens minted for the beneficiary.
  */
  function mintTokensOf(
    uint256 _projectId,
    uint256 _tokenCount,
    address _beneficiary,
    string calldata _memo,
    bool _preferClaimedTokens,
    bool _useReservedRate
  )
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.MINT,
      directory.isTerminalOf(_projectId, IJBPaymentTerminal(msg.sender))
    )
    returns (uint256 beneficiaryTokenCount)
  {
    // There should be tokens to mint.
    if (_tokenCount == 0) revert ZERO_TOKENS_TO_MINT();

    // Define variables that will be needed outside scoped section below.
    uint256 _reservedRate;

    // Scoped section prevents stack too deep. `_fundingCycle` only used within scope.
    {
      // Get a reference to the project's current funding cycle.
      JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

      // If the message sender is not a terminal, the current funding cycle must not be paused.
      if (
        _fundingCycle.mintPaused() &&
        !directory.isTerminalOf(_projectId, IJBPaymentTerminal(msg.sender))
      ) revert MINT_PAUSED_AND_NOT_TERMINAL_DELEGATE();

      // Determine the reserved rate to use.
      _reservedRate = _useReservedRate ? _fundingCycle.reservedRate() : 0;
    }

    if (_reservedRate == JBConstants.MAX_RESERVED_RATE)
      // Subtract the total weighted amount from the tracker so the full reserved token amount can be printed later.
      _processedTokenTrackerOf[_projectId] =
        _processedTokenTrackerOf[_projectId] -
        int256(_tokenCount);
    else {
      // The unreserved token count that will be minted for the beneficiary.
      beneficiaryTokenCount = PRBMath.mulDiv(
        _tokenCount,
        JBConstants.MAX_RESERVED_RATE - _reservedRate,
        JBConstants.MAX_RESERVED_RATE
      );

      if (_reservedRate == 0)
        // If there's no reserved rate, increment the tracker with the newly minted tokens.
        _processedTokenTrackerOf[_projectId] =
          _processedTokenTrackerOf[_projectId] +
          int256(beneficiaryTokenCount);

      // Mint the tokens.
      tokenStore.mintFor(_beneficiary, _projectId, beneficiaryTokenCount, _preferClaimedTokens);
    }

    emit MintTokens(
      _beneficiary,
      _projectId,
      _tokenCount,
      beneficiaryTokenCount,
      _memo,
      _reservedRate,
      msg.sender
    );
  }

  /**
    @notice
    Burns a token holder's supply.

    @dev
    Only a token's holder, a designated operator, or a project's terminal can burn it.

    @param _holder The account that is having its tokens burned.
    @param _projectId The ID of the project to which the tokens being burned belong.
    @param _tokenCount The number of tokens to burn.
    @param _memo A memo to pass along to the emitted event.
    @param _preferClaimedTokens A flag indicating whether a project's attached token contract should be burned first if they have been issued.
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
    requirePermissionAllowingOverride(
      _holder,
      _projectId,
      JBOperations.BURN,
      directory.isTerminalOf(_projectId, IJBPaymentTerminal(msg.sender))
    )
  {
    // There should be tokens to burn
    if (_tokenCount == 0) revert NO_BURNABLE_TOKENS();

    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // If the message sender is not a terminal, the current funding cycle must not be paused.
    if (
      _fundingCycle.burnPaused() &&
      !directory.isTerminalOf(_projectId, IJBPaymentTerminal(msg.sender))
    ) revert BURN_PAUSED_AND_SENDER_NOT_VALID_TERMINAL_DELEGATE();

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
    override
    returns (uint256)
  {
    return _distributeReservedTokensOf(_projectId, _memo);
  }

  /**
    @notice
    Allows other controllers to signal to this one that a migration is expected for the specified project.

    @dev
    This controller should not yet be the project's controller.

    @param _projectId The ID of the project that will be migrated to this controller.
    @param _from The controller being migrated from.
  */
  function prepForMigrationOf(uint256 _projectId, IJBController _from) external override {
    // This controller must not be the project's current controller.
    if (directory.controllerOf(_projectId) == this) revert CANT_MIGRATE_TO_CURRENT_CONTROLLER();

    // Set the tracker as the total supply.
    _processedTokenTrackerOf[_projectId] = int256(tokenStore.totalSupplyOf(_projectId));

    emit PrepMigration(_projectId, _from, msg.sender);
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
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.MIGRATE_CONTROLLER)
  {
    // This controller must be the project's current controller.
    if (directory.controllerOf(_projectId) != this) revert NOT_CURRENT_CONTROLLER();

    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Migration must be allowed
    if (!_fundingCycle.controllerMigrationAllowed()) revert MIGRATION_NOT_ALLOWED();

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
    Distributes all outstanding reserved tokens for a project.

    @param _projectId The ID of the project to which the reserved tokens belong.
    @param _memo A memo to pass along to the emitted event.

    @return tokenCount The amount of minted reserved tokens.
  */
  function _distributeReservedTokensOf(uint256 _projectId, string memory _memo)
    private
    returns (uint256 tokenCount)
  {
    // Get the current funding cycle to read the reserved rate from.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Get a reference to new total supply of tokens before minting reserved tokens.
    uint256 _totalTokens = tokenStore.totalSupplyOf(_projectId);

    // Get a reference to the number of tokens that need to be minted.
    tokenCount = _reservedTokenAmountFrom(
      _processedTokenTrackerOf[_projectId],
      _fundingCycle.reservedRate(),
      _totalTokens
    );

    // Set the tracker to be the new total supply.
    _processedTokenTrackerOf[_projectId] = int256(_totalTokens + tokenCount);

    // Get a reference to the project owner.
    address _owner = projects.ownerOf(_projectId);

    // Distribute tokens to splits and get a reference to the leftover amount to mint after all splits have gotten their share.
    uint256 _leftoverTokenCount = tokenCount == 0
      ? 0
      : _distributeToReservedTokenSplitsOf(_projectId, _fundingCycle, tokenCount);

    // Mint any leftover tokens to the project owner.
    if (_leftoverTokenCount > 0) tokenStore.mintFor(_owner, _projectId, _leftoverTokenCount, false);

    emit DistributeReservedTokens(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _owner,
      tokenCount,
      _leftoverTokenCount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Distribute tokens to the splits according to the specified funding cycle configuration.

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

      // The amount to send towards the split.
      uint256 _tokenCount = PRBMath.mulDiv(
        _amount,
        _split.percent,
        JBConstants.SPLITS_TOTAL_PERCENT
      );

      // Mints tokens for the split if needed.
      if (_tokenCount > 0) {
        tokenStore.mintFor(
          // If an allocator is set in the splits, set it as the beneficiary.
          // Otherwise if a projectId is set in the split, set the project's owner as the beneficiary.
          // If the split has a beneficiary send to the split's beneficiary. Otherwise send to the msg.sender.
          _split.allocator != IJBSplitAllocator(address(0))
            ? address(_split.allocator)
            : _split.projectId != 0
            ? projects.ownerOf(_split.projectId)
            : _split.beneficiary != address(0)
            ? _split.beneficiary
            : msg.sender,
          _projectId,
          _tokenCount,
          _split.preferClaimed
        );

        // If there's an allocator set, trigger its `allocate` function.
        if (_split.allocator != IJBSplitAllocator(address(0)))
          _split.allocator.allocate(
            _tokenCount,
            _projectId,
            JBSplitsGroups.RESERVED_TOKENS,
            _split
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
    Configures a funding cycle and stores information pertinent to the configuration.

    @param _projectId The ID of the project whose funding cycles are being reconfigured.
    @param _data Data that defines the funding cycle. These properties will remain fixed for the duration of the funding cycle.
    @param _metadata Metadata specifying the controller specific params that a funding cycle can have. These properties will remain fixed for the duration of the funding cycle.
    @param _mustStartAtOrAfter The time before which the configured funding cycle cannot start.
    @param _groupedSplits An array of splits to set for any number of groups. 
    @param _fundAccessConstraints An array containing amounts that a project can use from its treasury for each payment terminal. Amounts are fixed point numbers using the same number of decimals as the accompanying terminal.

    @return configuration The configuration of the funding cycle that was successfully reconfigured.
  */
  function _configure(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    uint256 _mustStartAtOrAfter,
    JBGroupedSplits[] memory _groupedSplits,
    JBFundAccessConstraints[] memory _fundAccessConstraints
  ) private returns (uint256) {
    // Make sure the provided reserved rate is valid.
    if (_metadata.reservedRate > JBConstants.MAX_RESERVED_RATE) revert INVALID_RESERVED_RATE();

    // Make sure the provided redemption rate is valid.
    if (_metadata.redemptionRate > JBConstants.MAX_REDEMPTION_RATE)
      revert INVALID_REDEMPTION_RATE();

    // Make sure the provided ballot redemption rate is valid.
    if (_metadata.ballotRedemptionRate > JBConstants.MAX_REDEMPTION_RATE)
      revert INVALID_BALLOT_REDEMPTION_RATE();

    // Configure the funding cycle's properties.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.configureFor(
      _projectId,
      _data,
      JBFundingCycleMetadataResolver.packFundingCycleMetadata(_metadata),
      _mustStartAtOrAfter
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

    // Set distribution limits if there are any.
    for (uint256 _i; _i < _fundAccessConstraints.length; _i++) {
      JBFundAccessConstraints memory _constraints = _fundAccessConstraints[_i];

      // If distribution limit value is larger than 248 bits, revert.
      if (_constraints.distributionLimit > type(uint248).max) revert INVALID_DISTRIBUTION_LIMIT();

      // If distribution limit currency value is larger than 8 bits, revert.
      if (_constraints.distributionLimitCurrency > type(uint8).max)
        revert INVALID_DISTRIBUTION_LIMIT_CURRENCY();

      // If overflow allowance value is larger than 248 bits, revert.
      if (_constraints.overflowAllowance > type(uint248).max) revert INVALID_OVERFLOW_ALLOWANCE();

      // If overflow allowance currency value is larger than 8 bits, revert.
      if (_constraints.overflowAllowanceCurrency > type(uint8).max)
        revert INVALID_OVERFLOW_ALLOWANCE_CURRENCY();

      // Set the distribution limit if there is one.
      if (_constraints.distributionLimit > 0)
        _packedDistributionLimitDataOf[_projectId][_fundingCycle.configuration][
          _constraints.terminal
        ] = _constraints.distributionLimit | (_constraints.distributionLimitCurrency << 248);

      // Set the overflow allowance if there is one.
      if (_constraints.overflowAllowance > 0)
        _packedOverflowAllowanceDataOf[_projectId][_fundingCycle.configuration][
          _constraints.terminal
        ] = _constraints.overflowAllowance | (_constraints.overflowAllowanceCurrency << 248);

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
    if (_reservedRate == JBConstants.MAX_RESERVED_RATE) return _unprocessedTokenBalanceOf;

    return
      PRBMath.mulDiv(
        _unprocessedTokenBalanceOf,
        JBConstants.MAX_RESERVED_RATE,
        JBConstants.MAX_RESERVED_RATE - _reservedRate
      ) - _unprocessedTokenBalanceOf;
  }
}
