// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './libraries/JBOperations.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

// Inheritance
import './interfaces/IJBController.sol';
import './abstract/JBOperatable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

contract JBController is IJBController, JBOperatable, Ownable, ReentrancyGuard {
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for FundingCycle;

  modifier onlyTerminal(uint256 _projectId) {
    require(directory.isTerminalOf(_projectId, msg.sender), 'UNAUTHORIZED');
    _;
  }

  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  // The difference between the processed token tracker of a project and the project's token's total supply is the amount of tokens that
  // still need to have reserves minted against them.
  mapping(uint256 => int256) private _processedTokenTrackerOf;

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
    The directory of terminals.
  */
  IJBDirectory public immutable override directory;

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
  uint256 public override fee = 10;

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
    @param _projects A Projects contract which mints ERC-721's that represent project ownership and transfers.
    @param _fundingCycleStore The contract storing all funding cycle configurations.
    @param _tokenStore The contract that manages token minting and burning.
    @param _splitsStore The contract that stores splits for each project.
    @param _directory The directory of terminals.
  */
  constructor(
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBFundingCycleStore _fundingCycleStore,
    IJBTokenStore _tokenStore,
    IJBSplitsStore _splitsStore,
    IJBDirectory _directory
  ) JBOperatable(_operatorStore) {
    projects = _projects;
    fundingCycleStore = _fundingCycleStore;
    tokenStore = _tokenStore;
    splitsStore = _splitsStore;
    directory = _directory;
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
    @param _properties The funding cycle configuration properties. These properties will remain fixed for the duration of the funding cycle.
      @dev _properties.target The amount that the project wants to payout during a funding cycle. Sent as a wad (18 decimals).
      @dev _properties.currency The currency of the `target`. Send 0 for ETH or 1 for USD.
      @dev _properties.duration The duration of the funding cycle for which the `target` amount is needed. Measured in days. Send 0 for cycles that are reconfigurable at any time.
      @dev _properties.cycleLimit The number of cycles that this configuration should last for before going back to the last permanent cycle. This has no effect for a project's first funding cycle.
      @dev _properties.discountRate A number from 0-200 (0-20%) indicating how many tokens will be minted as a result of a contribution made to this funding cycle compared to one made to the project's next funding cycle.
        If it's 0 (0%), each funding cycle's will have equal weight.
        If the number is 100 (10%), a contribution to the next funding cycle will only mint 90% of tokens that a contribution of the same amount made during the current funding cycle mints.
        If the number is 200 (20%), the difference will be 20%. 
        There's a special case: If the number is 201, the funding cycle will be non-recurring and one-time only.
      @dev _properties.ballot The ballot contract that will be used to approve subsequent reconfigurations. Must adhere to the IFundingCycleBallot interface.
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
    FundingCycleProperties calldata _properties,
    FundingCycleMetadata calldata _metadata,
    OverflowAllowance[] memory _overflowAllowances,
    Split[] memory _payoutSplits,
    Split[] memory _reservedTokenSplits,
    IJBTerminal _terminal
  ) external override {
    // Make sure the metadata is validated and packed into a uint256.
    uint256 _packedMetadata = _validateAndPackFundingCycleMetadata(_metadata);

    // Create the project for the owner. This this contract as the project's terminal,
    // which will give it exclusive access to manage the project's funding cycles and tokens.
    uint256 _projectId = projects.createFor(msg.sender, _handle, _uri);

    // Add the provided terminal to the list of terminals.
    directory.setControllerOf(_projectId, address(this));

    // Add the provided terminal to the list of terminals.
    directory.addTerminalOf(_projectId, _terminal);

    _configure(
      _projectId,
      _properties,
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
    @param _properties The funding cycle configuration properties. These properties will remain fixed for the duration of the funding cycle.
      @dev _properties.target The amount that the project wants to payout during a funding cycle. Sent as a wad (18 decimals).
      @dev _properties.currency The currency of the `target`. Send 0 for ETH or 1 for USD.
      @dev _properties.duration The duration of the funding cycle for which the `target` amount is needed. Measured in days. Send 0 for cycles that are reconfigurable at any time.
      @dev _properties.cycleLimit The number of cycles that this configuration should last for before going back to the last permanent cycle. This has no effect for a project's first funding cycle.
      @dev _properties.discountRate A number from 0-200 (0-20%) indicating how many tokens will be minted as a result of a contribution made to this funding cycle compared to one made to the project's next funding cycle.
        If it's 0 (0%), each funding cycle's will have equal weight.
        If the number is 100 (10%), a contribution to the next funding cycle will only mint 90% of tokens that a contribution of the same amount made during the current funding cycle mints.
        If the number is 200 (20%), the difference will be 20%. 
        There's a special case: If the number is 201, the funding cycle will be non-recurring and one-time only.
      @dev _properties.ballot The ballot contract that will be used to approve subsequent reconfigurations. Must adhere to the IFundingCycleBallot interface.
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
    FundingCycleProperties calldata _properties,
    FundingCycleMetadata calldata _metadata,
    OverflowAllowance[] memory _overflowAllowances,
    Split[] memory _payoutSplits,
    Split[] memory _reservedTokenSplits
  )
    external
    override
    nonReentrant
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.CONFIGURE)
    returns (uint256)
  {
    // Make sure the metadata is validated and packed into a uint256.
    uint256 _packedMetadata = _validateAndPackFundingCycleMetadata(_metadata);

    // All reserved tokens must be minted before configuring.
    if (uint256(_processedTokenTrackerOf[_projectId]) != tokenStore.totalSupplyOf(_projectId))
      _distributeReservedTokensOf(_projectId, '');

    // Configure the active project if its tokens have yet to be minted.
    bool _shouldConfigureActive = tokenStore.totalSupplyOf(_projectId) == 0;

    return
      _configure(
        _projectId,
        _properties,
        _packedMetadata,
        _overflowAllowances,
        _payoutSplits,
        _reservedTokenSplits,
        _shouldConfigureActive
      );
  }

  function withdrawFrom(uint256 _projectId, uint256 _amount)
    external
    override
    onlyTerminal(_projectId)
    returns (FundingCycle memory)
  {
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
    @param _preferUnstakedTokens Whether ERC20's should be burned first if they have been issued.

  */
  function mintTokensOf(
    uint256 _projectId,
    uint256 _tokenCount,
    address _beneficiary,
    string calldata _memo,
    bool _preferUnstakedTokens,
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
    FundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    require(_fundingCycle.mintPaused(), 'PAUSED');

    if (_shouldReserveTokens && _fundingCycle.reservedRate() == 200) {
      // Subtract the total weighted amount from the tracker so the full reserved token amount can be printed later.
      _processedTokenTrackerOf[_projectId] =
        _processedTokenTrackerOf[_projectId] -
        int256(_tokenCount);
    } else {
      if (!_shouldReserveTokens)
        // Set the minted tokens as processed so that reserved tokens cant be minted against them.
        _processedTokenTrackerOf[_projectId] =
          _processedTokenTrackerOf[_projectId] +
          int256(_tokenCount);

      // Redeem the tokens, which burns them.
      tokenStore.mintFor(_beneficiary, _projectId, _tokenCount, _preferUnstakedTokens);
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
    @param _preferUnstakedTokens Whether ERC20's should be burned first if they have been issued.
  */
  function burnTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    string calldata _memo,
    bool _preferUnstakedTokens
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
    FundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    require(_fundingCycle.burnPaused(), 'PAUSED');

    // Update the token tracker so that reserved tokens will still be correctly mintable.
    _subtractFromTokenTrackerOf(_projectId, _tokenCount);

    // Burn the tokens.
    tokenStore.burnFrom(_holder, _projectId, _tokenCount, _preferUnstakedTokens);

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
    override
    nonReentrant
    returns (uint256)
  {
    return _distributeReservedTokensOf(_projectId, _memo);
  }

  function swapTerminal(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    onlyTerminal(_projectId)
    nonReentrant
  {
    // Add the new terminal.
    directory.addTerminalOf(_projectId, _terminal);

    // Remove the current terminal.
    directory.removeTerminalOf(_projectId, IJBTerminal(msg.sender));
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
  function _validateAndPackFundingCycleMetadata(FundingCycleMetadata memory _metadata)
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
    FundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

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
  function _distributeToReservedTokenSplitsOf(FundingCycle memory _fundingCycle, uint256 _amount)
    private
    returns (uint256 leftoverAmount)
  {
    // Set the leftover amount to the initial amount.
    leftoverAmount = _amount;

    // TODO: changing _splits to "_receipients" or ... ?
    // Get a reference to the project's reserved token splits.
    Split[] memory _splits = splitsStore.splitsOf(
      _fundingCycle.projectId,
      _fundingCycle.configured,
      2
    );

    //Transfer between all splits.
    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // Get a reference to the split being iterated on.
      Split memory _split = _splits[_i];

      // The amount to send towards the split. Split percents are out of 10000.
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
    FundingCycleProperties calldata _properties,
    uint256 _packedMetadata,
    OverflowAllowance[] memory _overflowAllowances,
    Split[] memory _payoutSplits,
    Split[] memory _reservedTokenSplits,
    bool _shouldConfigureActive
  ) private returns (uint256) {
    // Configure the funding cycle's properties.
    FundingCycle memory _fundingCycle = fundingCycleStore.configureFor(
      _projectId,
      _properties,
      _packedMetadata,
      fee,
      _shouldConfigureActive
    );

    // Set payout splits if there are any.
    if (_payoutSplits.length > 0)
      splitsStore.set(_projectId, _fundingCycle.configured, 1, _payoutSplits);

    // Set token splits if there are any.
    if (_reservedTokenSplits.length > 0)
      splitsStore.set(_projectId, _fundingCycle.configured, 2, _reservedTokenSplits);

    for (uint256 _i; _i < _overflowAllowances.length; _i++) {
      OverflowAllowance memory _allowance = _overflowAllowances[_i];

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
