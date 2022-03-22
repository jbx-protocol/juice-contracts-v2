// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@paulrberg/contracts/math/PRBMath.sol';
import './interfaces/IJBPaymentTerminalStore.sol';
import './libraries/JBConstants.sol';
import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';
import './libraries/JBFixedPointNumber.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error CURRENCY_MISMATCH();
error DISTRIBUTION_AMOUNT_LIMIT_REACHED();
error FUNDING_CYCLE_PAYMENT_PAUSED();
error FUNDING_CYCLE_DISTRIBUTION_PAUSED();
error FUNDING_CYCLE_REDEEM_PAUSED();
error INADEQUATE_CONTROLLER_ALLOWANCE();
error INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();
error INSUFFICIENT_TOKENS();
error INVALID_FUNDING_CYCLE();
error PAYMENT_TERMINAL_MIGRATION_NOT_ALLOWED();
error PAYMENT_TERMINAL_UNAUTHORIZED();
error STORE_ALREADY_CLAIMED();

/**
  @notice
  Manages all bookkeeping for inflows and outflows of funds from any IJBPaymentTerminal.

  @dev
  Adheres to:
  IJBPaymentTerminalStore: General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.

  @dev
  Inherits from:
  ReentrancyGuard: Contract module that helps prevent reentrant calls to a function.
*/
contract JBPaymentTerminalStore is IJBPaymentTerminalStore, ReentrancyGuard {
  // A library that parses the packed funding cycle metadata into a friendlier format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  // A library that provides utility for fixed point numbers.
  using JBFixedPointNumber for uint256;

  /**
    @notice
    Ensures up to 18 decimal points of persisted fidelity on mulDiv operations of fixed point numbers. 
  */
  uint256 private constant _MAX_FIXED_POINT_FIDELITY = 18;

  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//

  /**
    @notice
    The Projects contract which mints ERC-721's that represent project ownership and transfers.
  */
  IJBProjects public immutable override projects;

  /**
    @notice
    The directory of terminals and controllers for projects.
  */
  IJBDirectory public immutable override directory;

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
    The contract that exposes price feeds.
  */
  IJBPrices public immutable override prices;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /**
    @notice
    The amount of tokens that each project has for each terminal, in terms of the terminal's token.

    @dev
    The used distribution limit is represented as a fixed point number with the same amount of decimals as its relative terminal.

    _terminal The terminal to which the balance applies.
    _projectId The ID of the project to get the balance of.
  */
  mapping(IJBPaymentTerminal => mapping(uint256 => uint256)) public override balanceOf;

  /**
    @notice
    The amount of funds that a project has distributed from its limit during the current funding cycle for each terminal, in terms of the distribution limit's currency.

    @dev
    Increases as projects use their preconfigured distribution limits.

    @dev
    The used distribution limit is represented as a fixed point number with the same amount of decimals as its relative terminal.

    _terminal The terminal to which the used distribution limit applies.
    _projectId The ID of the project to get the used distribution limit of.
    _fundingCycleNumber The number of the funding cycle during which the distribution limit was used.
  */
  mapping(IJBPaymentTerminal => mapping(uint256 => mapping(uint256 => uint256)))
    public
    override usedDistributionLimitOf;

  /**
    @notice
    The amount of funds that a project has used from its allowance during the current funding cycle configuration for each terminal, in terms of the overflow allowance's currency.

    @dev
    Increases as projects use their allowance.

    @dev
    The used allowance limit is represented as a fixed point number with the same amount of decimals as its relative terminal.

    _terminal The terminal to which the overflow allowance applies.
    _projectId The ID of the project to get the used overflow allowance of.
    _configuration The configuration of the during which the allowance was used.
  */
  mapping(IJBPaymentTerminal => mapping(uint256 => mapping(uint256 => uint256)))
    public
    override usedOverflowAllowanceOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the current overflowed amount in a terminal for a specified project.

    @dev
    The current overflow is represented as a fixed point number with the same amount of decimals as the specified terminal.

    @param _terminal The terminal for which the overflow is being calculated.
    @param _projectId The ID of the project to get overflow for.

    @return The current amount of overflow that project has in the specified terminal.
  */
  function currentOverflowOf(IJBPaymentTerminal _terminal, uint256 _projectId)
    external
    view
    override
    returns (uint256)
  {
    // Return the overflow during the project's current funding cycle.
    return
      _overflowDuring(
        _terminal,
        _projectId,
        fundingCycleStore.currentOf(_projectId),
        _terminal.currency()
      );
  }

  /**
    @notice
    Gets the current overflowed amount for a specified project across all terminals.

    @param _projectId The ID of the project to get total overflow for.
    @param _decimals The number of decimals that the fixed point overflow should include.
    @param _currency The currency that the total overflow should be in terms of.

    @return The current total amount of overflow that project has across all terminals.
  */
  function currentTotalOverflowOf(
    uint256 _projectId,
    uint256 _decimals,
    uint256 _currency
  ) external view override returns (uint256) {
    return _currentTotalOverflowOf(_projectId, _decimals, _currency);
  }

  /**
    @notice
    The current amount of overflowed tokens from a terminal that can be reclaimed by the specified number of tokens.

    @dev 
    If the project has an active funding cycle reconfiguration ballot, the project's ballot redemption rate is used.

    @dev
    The current reclaimable overflow is returned in terms of the specified terminal's currency.

    @dev
    The reclaimable overflow is represented as a fixed point number with the same amount of decimals as the specified terminal.

    @param _terminal The terminal for which the overflow is being calculated.
    @param _projectId The ID of the project to get the reclaimable overflow amount for.
    @param _tokenCount The number of tokens to make the calculation with, as a fixed point number with 18 decimals.

    @return The amount of overflowed tokens that can be reclaimed.
  */
  function currentReclaimableOverflowOf(
    IJBPaymentTerminal _terminal,
    uint256 _projectId,
    uint256 _tokenCount
  ) external view override returns (uint256) {
    return
      _reclaimableOverflowDuring(
        _terminal,
        _projectId,
        fundingCycleStore.currentOf(_projectId),
        _tokenCount,
        _terminal.decimals(),
        _terminal.currency()
      );
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /**
    @param _prices A contract that exposes price feeds.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _fundingCycleStore A contract storing all funding cycle configurations.
    @param _tokenStore A contract that manages token minting and burning.
  */
  constructor(
    IJBPrices _prices,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBFundingCycleStore _fundingCycleStore,
    IJBTokenStore _tokenStore
  ) {
    prices = _prices;
    projects = _projects;
    directory = _directory;
    fundingCycleStore = _fundingCycleStore;
    tokenStore = _tokenStore;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Records newly contributed tokens to a project.

    @dev
    Mint's the project's tokens according to values provided by a configured data source. If no data source is configured, mints tokens proportional to the amount of the contribution.

    @dev
    The msg.sender must be an IJBPaymentTerminal. The amount specified in the params is in terms of the msg.senders tokens.

    @param _payer The original address that sent the payment to the terminal.
    @param _amount The amount of tokens being paid, as a fixed point number. Includes the token being paid, the value, the number of decimals included, and the currency of the amount.
    @param _projectId The ID of the project being paid.
    @param _beneficiary The address that should receive benefits from the payment.
    @param _baseWeightCurrency The currency to base token issuance on.
    @param _memo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.
    @param _metadata Bytes to send along to the data source, if one is provided.

    @return fundingCycle The project's funding cycle during which payment was made.
    @return tokenCount The number of project tokens that were minted, as a fixed point number with 18 decimals.
    @return delegate A delegate contract to use for subsequent calls.
    @return memo A memo that should be passed along to the emitted event.
  */
  function recordPaymentFrom(
    address _payer,
    JBTokenAmount calldata _amount,
    uint256 _projectId,
    address _beneficiary,
    uint256 _baseWeightCurrency,
    string calldata _memo,
    bytes memory _metadata
  )
    external
    override
    nonReentrant
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 tokenCount,
      IJBPayDelegate delegate,
      string memory memo
    )
  {
    // Get a reference to the current funding cycle for the project.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The project must have a funding cycle configured.
    if (fundingCycle.number == 0) revert INVALID_FUNDING_CYCLE();

    // Must not be paused.
    if (fundingCycle.payPaused()) revert FUNDING_CYCLE_PAYMENT_PAUSED();

    // The weight according to which new token supply is to be minted, as a fixed point number with 18 decimals.
    uint256 _weight;

    // If the funding cycle has configured a data source, use it to derive a weight and memo.
    if (fundingCycle.useDataSourceForPay()) {
      // Create the params that'll be sent to the data source.
      JBPayParamsData memory _data = JBPayParamsData(
        IJBPaymentTerminal(msg.sender),
        _payer,
        _amount,
        _projectId,
        fundingCycle.weight,
        fundingCycle.reservedRate(),
        _beneficiary,
        _memo,
        _metadata
      );
      (_weight, memo, delegate) = fundingCycle.dataSource().payParams(_data);
    }
    // Otherwise use the funding cycle's weight
    else {
      _weight = fundingCycle.weight;
      memo = _memo;
    }

    // If there's no amount being recorded, there's nothing left to do.
    if (_amount.value == 0) return (fundingCycle, 0, delegate, memo);

    // Add the amount to the token balance of the project if needed.
    balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] =
      balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] +
      _amount.value;

    // If there's no weight, token count must be 0 so there's nothing left to do.
    if (_weight == 0) return (fundingCycle, 0, delegate, memo);

    // If the terminal should base its weight on a different currency from the terminal's currency, determine the factor.
    // The weight is always a fixed point mumber with 18 decimals. The ratio should be the same.
    uint256 _weightRatio = _getWeightRatio(_amount, _baseWeightCurrency);

    // Find the number of tokens to mint, as a fixed point number with as many decimals as `weight` has.
    tokenCount = PRBMath.mulDiv(_amount.value, _weight, _weightRatio);
  }

  /**
    @notice
    Records newly distributed funds for a project.

    @dev
    The msg.sender must be an IJBPaymentTerminal. The amount specified in the params is in terms of the msg.senders tokens.

    @param _projectId The ID of the project that is having funds distributed.
    @param _amount The amount to use from the distribution limit, as a fixed point number. i
    @param _currency The currency of the `_amount`.
    @param _balanceCurrency The currency that the balance is expected to be in terms of.

    @return fundingCycle The funding cycle during which the distribution was made.
    @return distributedAmount The amount of terminal tokens distributed.
  */
  function recordDistributionFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _balanceCurrency
  )
    external
    override
    nonReentrant
    returns (JBFundingCycle memory fundingCycle, uint256 distributedAmount)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The funding cycle must not be configured to have distributions paused.
    if (fundingCycle.distributionsPaused()) revert FUNDING_CYCLE_DISTRIBUTION_PAUSED();

    // The new total amount that has been distributed during this funding cycle.
    uint256 _newUsedDistributionLimitOf = usedDistributionLimitOf[IJBPaymentTerminal(msg.sender)][
      _projectId
    ][fundingCycle.number] + _amount;

    // Amount must be within what is still distributable.
    (uint256 _distributionLimitOf, uint256 _distributionLimitCurrencyOf) = directory
      .controllerOf(_projectId)
      .distributionLimitOf(_projectId, fundingCycle.configuration, IJBPaymentTerminal(msg.sender));

    if (_newUsedDistributionLimitOf > _distributionLimitOf || _distributionLimitOf == 0)
      revert DISTRIBUTION_AMOUNT_LIMIT_REACHED();

    // Make sure the currencies match.
    if (_currency != _distributionLimitCurrencyOf) revert CURRENCY_MISMATCH();

    // Convert the amount to the balance's currency.
    distributedAmount = (_currency == _balanceCurrency) ? _amount : distributedAmount = PRBMath
      .mulDiv(
        _amount,
        10**_MAX_FIXED_POINT_FIDELITY, // Use _MAX_FIXED_POINT_FIDELITY to keep as much of the `_amount.value`'s fidelity as possible when converting.
        prices.priceFor(_currency, _balanceCurrency, _MAX_FIXED_POINT_FIDELITY)
      );

    // The amount being distributed must be available.
    if (distributedAmount > balanceOf[IJBPaymentTerminal(msg.sender)][_projectId])
      revert INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();

    // Store the new amount.
    usedDistributionLimitOf[IJBPaymentTerminal(msg.sender)][_projectId][
      fundingCycle.number
    ] = _newUsedDistributionLimitOf;

    // Removed the distributed funds from the project's token balance.
    balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] =
      balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] -
      distributedAmount;
  }

  /**
    @notice
    Records newly used allowance funds of a project.

    @dev
    The msg.sender must be an IJBPaymentTerminal. The amount specified in the params is in terms of the msg.senders tokens.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount to use from the allowance, as a fixed point number. 
    @param _currency The currency of the `_amount`.
    @param _balanceCurrency The currency that the balance is expected to be in terms of.

    @return fundingCycle The funding cycle during which the withdrawal is being made.
    @return withdrawnAmount The amount terminal tokens used, as a fixed point number with 18 decimals.
  */
  function recordUsedAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _balanceCurrency
  )
    external
    override
    nonReentrant
    returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Get a reference to the new used overflow allowance.
    uint256 _newUsedOverflowAllowanceOf = usedOverflowAllowanceOf[IJBPaymentTerminal(msg.sender)][
      _projectId
    ][fundingCycle.configuration] + _amount;

    // There must be sufficient allowance available.
    (uint256 _overflowAllowanceOf, uint256 _overflowAllowanceCurrency) = directory
      .controllerOf(_projectId)
      .overflowAllowanceOf(_projectId, fundingCycle.configuration, IJBPaymentTerminal(msg.sender));

    if (_newUsedOverflowAllowanceOf > _overflowAllowanceOf || _overflowAllowanceOf == 0)
      revert INADEQUATE_CONTROLLER_ALLOWANCE();

    // Make sure the currencies match.
    if (_currency != _overflowAllowanceCurrency) revert CURRENCY_MISMATCH();

    // Convert the amount to this store's terminal's token.
    withdrawnAmount = (_currency == _balanceCurrency)
      ? _amount
      : PRBMath.mulDiv(
        _amount,
        10**_MAX_FIXED_POINT_FIDELITY, // Use _MAX_FIXED_POINT_FIDELITY to keep as much of the `_amount.value`'s fidelity as possible when converting.
        prices.priceFor(_currency, _balanceCurrency, _MAX_FIXED_POINT_FIDELITY)
      );

    // The amount being withdrawn must be available in the overflow.
    if (
      withdrawnAmount >
      _overflowDuring(IJBPaymentTerminal(msg.sender), _projectId, fundingCycle, _balanceCurrency)
    ) revert INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();

    // Store the incremented value.
    usedOverflowAllowanceOf[IJBPaymentTerminal(msg.sender)][_projectId][
      fundingCycle.configuration
    ] = _newUsedOverflowAllowanceOf;

    // Update the project's token balance.
    balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] =
      balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] -
      withdrawnAmount;
  }

  /**
    @notice
    Records newly redeemed tokens of a project.

    @dev
    The msg.sender must be an IJBPaymentTerminal. The amount specified in the params is in terms of the msg.senders tokens.

    @param _holder The account that is having its tokens redeemed.
    @param _projectId The ID of the project to which the tokens being redeemed belong.
    @param _tokenCount The number of project tokens to redeem, as a fixed point number with 18 decimals.
    @param _balanceDecimals The amount of decimals expected in the returned `reclaimAmount`.
    @param _balanceCurrency The currency that the stored balance is expected to be in terms of.
    @param _beneficiary The address that will benefit from the claimed amount.
    @param _memo A memo to pass along to the emitted event.
    @param _metadata Bytes to send along to the data source, if one is provided.

    @return fundingCycle The funding cycle during which the redemption was made.
    @return reclaimAmount The amount of terminal tokens reclaimed, as a fixed point number with 18 decimals.
    @return delegate A delegate contract to use for subsequent calls.
    @return memo A memo that should be passed along to the emitted event.
  */
  function recordRedemptionFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _balanceDecimals,
    uint256 _balanceCurrency,
    address payable _beneficiary,
    string calldata _memo,
    bytes memory _metadata
  )
    external
    override
    nonReentrant
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 reclaimAmount,
      IJBRedemptionDelegate delegate,
      string memory memo
    )
  {
    // The holder must have the specified number of the project's tokens.
    if (tokenStore.balanceOf(_holder, _projectId) < _tokenCount) revert INSUFFICIENT_TOKENS();

    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    if (fundingCycle.redeemPaused()) revert FUNDING_CYCLE_REDEEM_PAUSED();

    // If the funding cycle has configured a data source, use it to derive a claim amount and memo.
    if (fundingCycle.useDataSourceForRedeem()) {
      // Create the params that'll be sent to the data source.
      JBRedeemParamsData memory _data = JBRedeemParamsData(
        IJBPaymentTerminal(msg.sender),
        _holder,
        _tokenCount,
        _balanceDecimals,
        _projectId,
        fundingCycle.redemptionRate(),
        fundingCycle.ballotRedemptionRate(),
        _balanceCurrency,
        _beneficiary,
        _memo,
        _metadata
      );
      (reclaimAmount, memo, delegate) = fundingCycle.dataSource().redeemParams(_data);
    } else {
      reclaimAmount = _reclaimableOverflowDuring(
        IJBPaymentTerminal(msg.sender),
        _projectId,
        fundingCycle,
        _tokenCount,
        _balanceDecimals,
        _balanceCurrency
      );
      memo = _memo;
    }

    // The amount being reclaimed must be within the project's balance.
    if (reclaimAmount > balanceOf[IJBPaymentTerminal(msg.sender)][_projectId])
      revert INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();

    // Remove the reclaimed funds from the project's balance.
    if (reclaimAmount > 0)
      balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] =
        balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] -
        reclaimAmount;
  }

  /**
    @notice
    Records newly added funds for the project.

    @dev
    The msg.sender must be an IJBPaymentTerminal. The amount specified in the params is in terms of the msg.senders tokens.

    @param _projectId The ID of the project to which the funds being added belong.
    @param _amount The amount of temrinal tokens added, as a fixed point number with 18 decimals.

    @return fundingCycle The current funding cycle for the project.
  */
  function recordAddedBalanceFor(uint256 _projectId, uint256 _amount)
    external
    override
    nonReentrant
    returns (JBFundingCycle memory fundingCycle)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Increment the balance.
    balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] =
      balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] +
      _amount;
  }

  /**
    @notice
    Records the migration of funds from this store.

    @dev
    The msg.sender must be an IJBPaymentTerminal. The amount returned is in terms of the msg.senders tokens.

    @param _projectId The ID of the project being migrated.

    @return balance The project's current terminal token balance, as a fixed point number with 18 decimals.
  */
  function recordMigration(uint256 _projectId)
    external
    override
    nonReentrant
    returns (uint256 balance)
  {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Migration must be allowed
    if (!_fundingCycle.terminalMigrationAllowed()) revert PAYMENT_TERMINAL_MIGRATION_NOT_ALLOWED();

    // Return the current balance.
    balance = balanceOf[IJBPaymentTerminal(msg.sender)][_projectId];

    // Set the balance to 0.
    balanceOf[IJBPaymentTerminal(msg.sender)][_projectId] = 0;
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  function _getWeightRatio(JBTokenAmount calldata _amount, uint256 _baseWeightCurrency)
    private
    view
    returns (uint256)
  {
    return
      _amount.currency == _baseWeightCurrency
        ? 10**_amount.decimals // Use `_amount.decimals` to make sure the resulting `tokenCount` keeps the same decimal fidelity as `weight`.
        : prices.priceFor(_amount.currency, _baseWeightCurrency, _amount.decimals);
  }

  /**
    @notice
    The amount of overflowed tokens from a terminal that can be reclaimed by the specified number of tokens during the specified funding cycle.

    @dev 
    If the project has an active funding cycle reconfiguration ballot, the project's ballot redemption rate is used.

    @dev
    The reclaimable overflow is returned in terms of the specified currency.

    @dev
    The reclaimable overflow is represented as a fixed point number with the same amount of decimals as the specified terminal.epresented as a fixed point number with 18 decimals.

    @param _terminal The terminal for which the overflow is being calculated.
    @param _projectId The ID of the project to get the reclaimable overflow amount for.
    @param _fundingCycle The funding cycle during which reclaimable overflow is being calculated.
    @param _tokenCount The number of tokens to make the calculation with, as a fixed point number with 18 decimals.
    @param _balanceDecimals The expected number of decimals that are included in the stored balance.
    @param _balanceCurrency The expected currency that the stored balance is measured in.

    @return The amount of overflowed tokens that can be reclaimed.
  */
  function _reclaimableOverflowDuring(
    IJBPaymentTerminal _terminal,
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _tokenCount,
    uint256 _balanceDecimals,
    uint256 _balanceCurrency
  ) private view returns (uint256) {
    // Get the amount of current overflow.
    // Use the local overflow if the funding cycle specifies that it should be used. Otherwise use the project's total overflow across all of its terminals.
    uint256 _currentOverflow = _fundingCycle.shouldUseLocalBalanceForRedemptions()
      ? _overflowDuring(_terminal, _projectId, _fundingCycle, _balanceCurrency)
      : _currentTotalOverflowOf(_projectId, _balanceDecimals, _balanceCurrency);

    // If there is no overflow, nothing is claimable.
    if (_currentOverflow == 0) return 0;

    // Get the total number of tokens in circulation.
    uint256 _totalSupply = tokenStore.totalSupplyOf(_projectId);

    // Get the number of reserved tokens the project has.
    uint256 _reservedTokenAmount = directory.controllerOf(_projectId).reservedTokenBalanceOf(
      _projectId,
      _fundingCycle.reservedRate()
    );

    // If there are reserved tokens, add them to the total supply.
    if (_reservedTokenAmount > 0) _totalSupply = _totalSupply + _reservedTokenAmount;

    // If the amount being redeemed is the total supply, return the rest of the overflow.
    if (_tokenCount == _totalSupply) return _currentOverflow;

    // Use the ballot redemption rate if the queued cycle is pending approval according to the previous funding cycle's ballot.
    uint256 _redemptionRate = fundingCycleStore.currentBallotStateOf(_projectId) ==
      JBBallotState.Active
      ? _fundingCycle.ballotRedemptionRate()
      : _fundingCycle.redemptionRate();

    // If the redemption rate is 0, nothing is claimable.
    if (_redemptionRate == 0) return 0;

    // Get a reference to the linear proportion.
    uint256 _base = PRBMath.mulDiv(_currentOverflow, _tokenCount, _totalSupply);

    // These conditions are all part of the same curve. Edge conditions are separated because fewer operation are necessary.
    if (_redemptionRate == JBConstants.MAX_REDEMPTION_RATE) return _base;

    return
      PRBMath.mulDiv(
        _base,
        _redemptionRate +
          PRBMath.mulDiv(
            _tokenCount,
            JBConstants.MAX_REDEMPTION_RATE - _redemptionRate,
            _totalSupply
          ),
        JBConstants.MAX_REDEMPTION_RATE
      );
  }

  /**
    @notice
    Gets the amount that is overflowing when measured from the specified funding cycle.

    @dev
    This amount changes as the price of the terminal's token changes in relation to the currency being used to measure the distribution limit.

    @param _terminal The terminal for which the overflow is being calculated.
    @param _projectId The ID of the project to get overflow for.
    @param _fundingCycle The ID of the funding cycle to base the overflow on.
    @param _balanceCurrency The currency that the stored balance is expected to be in terms of.

    @return overflow The overflow of funds, as a fixed point number with 18 decimals.
  */
  function _overflowDuring(
    IJBPaymentTerminal _terminal,
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _balanceCurrency
  ) private view returns (uint256) {
    // Get the current balance of the project.
    uint256 _balanceOf = balanceOf[_terminal][_projectId];

    // If there's no balance, there's no overflow.
    if (_balanceOf == 0) return 0;

    // Get a reference to the distribution limit during the funding cycle.
    (uint256 _distributionLimit, uint256 _distributionLimitCurrency) = directory
      .controllerOf(_projectId)
      .distributionLimitOf(_projectId, _fundingCycle.configuration, _terminal);

    // Get a reference to the amount still distributable during the funding cycle.
    uint256 _distributionLimitRemaining = _distributionLimit -
      usedDistributionLimitOf[_terminal][_projectId][_fundingCycle.number];

    // Convert the _distributionRemaining to be in terms of the provided currency.
    if (_distributionLimitRemaining != 0 && _distributionLimitCurrency != _balanceCurrency)
      _distributionLimitRemaining = PRBMath.mulDiv(
        _distributionLimitRemaining,
        10**_MAX_FIXED_POINT_FIDELITY, // Use _MAX_FIXED_POINT_FIDELITY to keep as much of the `_amount.value`'s fidelity as possible when converting.
        prices.priceFor(_distributionLimitCurrency, _balanceCurrency, _MAX_FIXED_POINT_FIDELITY)
      );

    // Overflow is the balance of this project minus the amount that can still be distributed.
    return _balanceOf > _distributionLimitRemaining ? _balanceOf - _distributionLimitRemaining : 0;
  }

  /**
    @notice
    Gets the amount that is overflowing across all terminals in terms of this store's terminal's currency when measured from the specified funding cycle.

    @dev
    This amount changes as the price of the token changes in relation to the currency being used to measure the distribution limits.

    @param _projectId The ID of the project to get total overflow for.
    @param _decimals The number of decimals that the fixed point overflow should include.
    @param _currency The currency that the overflow should be in terms of.

    @return overflow The overflow of funds, as a fixed point number with 18 decimals
  */
  function _currentTotalOverflowOf(
    uint256 _projectId,
    uint256 _decimals,
    uint256 _currency
  ) private view returns (uint256) {
    // Get a reference to the project's terminals.
    IJBPaymentTerminal[] memory _terminals = directory.terminalsOf(_projectId);

    // Keep a reference to the ETH overflow across all terminals, as a fixed point number with 18 decimals.
    uint256 _ethOverflow;

    // Add the current ETH overflow for each terminal.
    for (uint256 _i = 0; _i < _terminals.length; _i++)
      _ethOverflow = _ethOverflow + _terminals[_i].currentEthOverflowOf(_projectId);

    // Convert the ETH overflow to the specified currency if needed, maintaining a fixed point number with 18 decimals.
    uint256 _totalOverflow18Decimal = _currency == JBCurrencies.ETH
      ? _ethOverflow
      : PRBMath.mulDiv(_ethOverflow, 10**18, prices.priceFor(JBCurrencies.ETH, _currency, 18));

    // Adjust the decimals of the fixed point number if needed to match the target decimals.
    return
      (_decimals == 18)
        ? _totalOverflow18Decimal
        : _totalOverflow18Decimal.adjustDecimals(18, _decimals);
  }
}
