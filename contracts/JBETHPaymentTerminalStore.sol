// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
import '@paulrberg/contracts/math/PRBMath.sol';

import './interfaces/IJBPrices.sol';
import './interfaces/IJBTokenStore.sol';
import './interfaces/IJBTerminal.sol';

import './libraries/JBConstants.sol';
import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error CURRENCY_MISMATCH();
error DISTRIBUTION_AMOUNT_LIMIT_REACHED();
error FUNDING_CYCLE_PAYMENT_PAUSED();
error FUNDING_CYCLE_DISTRIBUTION_PAUSED();
error FUNDING_CYCLE_REDEEM_PAUSED();
error INADEQUATE_CLAIM_AMOUNT();
error INADEQUATE_CONTROLLER_ALLOWANCE();
error INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();
error INADEQUATE_TOKEN_COUNT();
error INADEQUATE_WITHDRAW_AMOUNT();
error INSUFFICIENT_TOKENS();
error INVALID_FUNDING_CYCLE();
error PAYMENT_TERMINAL_MIGRATION_NOT_ALLOWED();
error PAYMENT_TERMINAL_UNAUTHORIZED();
error STORE_ALREADY_CLAIMED();

/**
  @notice
  This contract manages all bookkeeping for inflows and outflows of funds for a terminal.

  @dev
  Aside from the public view methods, the external methods should be called by the associated terminal.
*/
contract JBETHPaymentTerminalStore {
  // A library that parses the packed funding cycle metadata into a friendlier format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  // A modifier only allowing the associated payment terminal to access the function.
  modifier onlyAssociatedPaymentTerminal() {
    if (msg.sender != address(terminal)) {
      revert PAYMENT_TERMINAL_UNAUTHORIZED();
    }
    _;
  }

  event DelegateDidPay(IJBPayDelegate indexed delegate, JBDidPayData data);

  event DelegateDidRedeem(IJBRedemptionDelegate indexed delegate, JBDidRedeemData data);

  /**
    @notice
    The Projects contract which mints ERC-721's that represent project ownership and transfers.
  */
  IJBProjects public immutable projects;

  /**
    @notice
    The directory of terminals and controllers for projects.
  */
  IJBDirectory public immutable directory;

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
    The contract that exposes price feeds.
  */
  IJBPrices public immutable prices;

  /**
    @notice
    The associated payment terminal for which this contract stores data.
  */
  IJBTerminal public terminal;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /**
    @notice
    The amount of ETH that each project has.

    _projectId The ID of the project to get the balance of.
  */
  mapping(uint256 => uint256) public balanceOf;

  /**
    @notice
    The amount of overflow (in the terminal's currency) that a project has used from its allowance during the current funding cycle configuration.

    @dev
    Increases as projects use their allowance.

    _projectId The ID of the project to get the used overflow allowance of.
    _configuration The configuration of the during which the allowance applies.
  */
  mapping(uint256 => mapping(uint256 => uint256)) public usedOverflowAllowanceOf;

  /**
    @notice
    The amount (in the terminal's currency) that a project has distributed from its limit during the current funding cycle.

    @dev
    Increases as projects use their distribution limit.

    _projectId The ID of the project to get the used distribution limit of.
    _fundingCycleNumber The number representing the funding cycle.
  */
  mapping(uint256 => mapping(uint256 => uint256)) public usedDistributionLimitOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the current overflowed amount (in the terminal's currency) in this terminal for a specified project.

    @param _projectId The ID of the project to get overflow for.

    @return The current amount of overflow that project has in this terminal.
  */
  function currentOverflowOf(uint256 _projectId) external view returns (uint256) {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    return _overflowDuring(_projectId, _fundingCycle);
  }

  /**
    @notice
    Gets the current overflowed amount (in the terminal's currency) for a specified project across all terminals.

    @param _projectId The ID of the project to get total overflow for.

    @return The current total amount of overflow that project has across all terminals.
  */
  function currentTotalOverflowOf(uint256 _projectId) external view returns (uint256) {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    return _totalOverflowDuring(_projectId, _fundingCycle);
  }

  /**
    @notice
    The amount of overflowed ETH that can be reclaimed by the specified number of tokens.

    @dev If the project has an active funding cycle reconfiguration ballot, the project's ballot redemption rate is used.

    @param _projectId The ID of the project to get a reclaimable amount for.
    @param _tokenCount The number of tokens to make the calculation with.

    @return The amount of overflowed ETH that can be reclaimed.
  */
  function reclaimableOverflowOf(uint256 _projectId, uint256 _tokenCount)
    external
    view
    returns (uint256)
  {
    return _reclaimableOverflowOf(_projectId, fundingCycleStore.currentOf(_projectId), _tokenCount);
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
    Records newly contributed ETH to a project.

    @dev
    Mint's the project's tokens according to values provided by a configured data source. If no data source is configured, mints tokens proportional to the amount of the contribution.

    @dev
    Only the associated payment terminal can record a payment.

    @param _payer The original address that sent the payment to the terminal.
    @param _amount The amount that is being paid in wei.
    @param _projectId The ID of the project being paid.
    @param _preferClaimedTokensAndBeneficiary Two properties are included in this packed uint256:
      The first bit contains the flag indicating whether the request prefers to issue tokens claimed as ERC-20s.
      The remaining bits contains the address that should receive benefits from the payment.

      This design is necessary two prevent a "Stack too deep" compiler error that comes up if the variables are declared seperately.
    @param _minReturnedTokens The minimum number of tokens expected to be minted in return.
    @param _memo A memo that will be included in the published event.
    @param _delegateMetadata Bytes to send along to the delegate, if one is used.

    @return fundingCycle The project's funding cycle during which payment was made.
    @return weight The weight according to which new token supply was minted.
    @return tokenCount The number of tokens that were minted.
    @return memo A memo that should be passed along to the emitted event.
  */
  function recordPaymentFrom(
    address _payer,
    uint256 _amount,
    uint256 _projectId,
    uint256 _preferClaimedTokensAndBeneficiary,
    uint256 _minReturnedTokens,
    string memory _memo,
    bytes memory _delegateMetadata
  )
    external
    onlyAssociatedPaymentTerminal
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 weight,
      uint256 tokenCount,
      string memory memo
    )
  {
    // Get a reference to the current funding cycle for the project.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The project must have a funding cycle configured.
    if (fundingCycle.number == 0) {
      revert INVALID_FUNDING_CYCLE();
    }

    // Must not be paused.
    if (fundingCycle.payPaused()) {
      revert FUNDING_CYCLE_PAYMENT_PAUSED();
    }

    // Save a reference to the delegate to use.
    IJBPayDelegate _delegate;

    // If the funding cycle has configured a data source, use it to derive a weight and memo.
    if (fundingCycle.useDataSourceForPay()) {
      (weight, memo, _delegate, _delegateMetadata) = fundingCycle.dataSource().payParams(
        JBPayParamsData(
          _payer,
          _amount,
          _projectId,
          fundingCycle.weight,
          fundingCycle.reservedRate(),
          address(uint160(_preferClaimedTokensAndBeneficiary >> 1)),
          _memo,
          _delegateMetadata
        )
      );
      // Otherwise use the funding cycle's weight
    } else {
      weight = fundingCycle.weight;
      memo = _memo;
    }

    if (_amount > 0) {
      // Add the amount to the ETH balance of the project if needed.
      balanceOf[_projectId] = balanceOf[_projectId] + _amount;

      // Amount and weight must be non-zero in order to mint tokens.
      if (weight > 0) {
        tokenCount = directory.controllerOf(_projectId).mintTokensOf(
          _projectId,
          PRBMathUD60x18.mul(_amount, weight), // Multiply the amount by the weight to determine the amount of tokens to mint
          address(uint160(_preferClaimedTokensAndBeneficiary >> 1)),
          '',
          (_preferClaimedTokensAndBeneficiary & 1) == 1,
          fundingCycle.reservedRate()
        );
      }
    }

    // The token count for the beneficiary must be greater than or equal to the minimum expected.
    if (tokenCount < _minReturnedTokens) {
      revert INADEQUATE_TOKEN_COUNT();
    }

    // If a delegate was returned by the data source, issue a callback to it.
    if (_delegate != IJBPayDelegate(address(0))) {
      JBDidPayData memory _data = JBDidPayData(
        _payer,
        _projectId,
        _amount,
        weight,
        tokenCount,
        payable(address(uint160(_preferClaimedTokensAndBeneficiary >> 1))),
        memo,
        _delegateMetadata
      );
      _delegate.didPay(_data);
      emit DelegateDidPay(_delegate, _data);
    }
  }

  /**
    @notice
    Records newly distributed funds for a project.

    @dev
    Only the associated payment terminal can record a distribution.

    @param _projectId The ID of the project that is having funds distributed.
    @param _amount The amount being distributed as a fixed point number.
    @param _currency The expected currency of the `_amount` being tapped. This must match the project's current funding cycle's currency.
    @param _minReturnedWei The minimum number of wei that should be distributed.

    @return fundingCycle The funding cycle during which the withdrawal was made.
    @return distributedAmount The amount distribution in wei.
  */
  function recordDistributionFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei
  )
    external
    onlyAssociatedPaymentTerminal
    returns (JBFundingCycle memory fundingCycle, uint256 distributedAmount)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The funding cycle must not be configured to have distributions paused.
    if (fundingCycle.distributionsPaused()) {
      revert FUNDING_CYCLE_DISTRIBUTION_PAUSED();
    }

    // The new total amount that has been distributed during this funding cycle.
    uint256 _newUsedDistributionLimitOf = usedDistributionLimitOf[_projectId][fundingCycle.number] +
      _amount;

    // Amount must be within what is still distributable.
    uint256 _distributionLimitOf = directory.controllerOf(_projectId).distributionLimitOf(
        _projectId,
        fundingCycle.configuration,
        terminal
      );

    if (_newUsedDistributionLimitOf > _distributionLimitOf || _distributionLimitOf == 0) {
      revert DISTRIBUTION_AMOUNT_LIMIT_REACHED();
    }

    // Make sure the currencies match.
    if (
      _currency !=
      directory.controllerOf(_projectId).distributionLimitCurrencyOf(
        _projectId,
        fundingCycle.configuration,
        terminal
      )
    ) {
      revert CURRENCY_MISMATCH();
    }

    // Convert the amount to wei.
    distributedAmount = (_currency == JBCurrencies.ETH)
      ? _amount
      : PRBMathUD60x18.div(_amount, prices.priceFor(_currency, JBCurrencies.ETH));

    // The amount being distributed must be available.
    if (distributedAmount > balanceOf[_projectId]) {
      revert INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();
    }

    // The amount being distributed must be at least as much as was expected.
    if (_minReturnedWei > distributedAmount) {
      revert INADEQUATE_WITHDRAW_AMOUNT();
    }

    // Store the new amount.
    usedDistributionLimitOf[_projectId][fundingCycle.number] = _newUsedDistributionLimitOf;

    // Removed the distributed funds from the project's ETH balance.
    balanceOf[_projectId] = balanceOf[_projectId] - distributedAmount;
  }

  /**
    @notice
    Records newly used allowance funds of a project.

    @dev
    Only the associated payment terminal can record a used allowance.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount of the allowance to use as a fixed point number.
    @param _currency The currency of the `_amount` value. Must match the funding cycle's currency.
    @param _minReturnedWei The amount of wei that is expected to be withdrawn.

    @return fundingCycle The funding cycle during which the withdrawal is being made.
    @return withdrawnAmount The amount withdrawn in wei.
  */
  function recordUsedAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei
  )
    external
    onlyAssociatedPaymentTerminal
    returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Get a reference to the new used overflow allowance.
    uint256 _newUsedOverflowAllowanceOf = usedOverflowAllowanceOf[_projectId][
      fundingCycle.configuration
    ] + _amount;

    // There must be sufficient allowance available.
    uint256 _allowanceOf = directory.controllerOf(_projectId).overflowAllowanceOf(
        _projectId,
        fundingCycle.configuration,
        terminal
      );

    if(_newUsedOverflowAllowanceOf > _allowanceOf || _allowanceOf == 0) {
      revert INADEQUATE_CONTROLLER_ALLOWANCE();
    }

    // Make sure the currencies match.
    if (
      _currency !=
      directory.controllerOf(_projectId).overflowAllowanceCurrencyOf(
        _projectId,
        fundingCycle.configuration,
        terminal
      )
    ) {
      revert CURRENCY_MISMATCH();
    }

    // Convert the amount to wei.
    withdrawnAmount = (_currency == JBCurrencies.ETH)
      ? _amount
      : PRBMathUD60x18.div(_amount, prices.priceFor(_currency, JBCurrencies.ETH));

    // Get the current funding target
    uint256 distributionLimit =
      directory.controllerOf(_projectId).distributionLimitOf(
        _projectId,
        fundingCycle.configuration,
        terminal
      );

    uint256 _leftToDistribute = distributionLimit - usedDistributionLimitOf[_projectId][fundingCycle.number];

    // Get the distribution limit currency (which might or might not be the same as the overflow allowance)
    uint256 _distributionLimitCurrency = directory.controllerOf(_projectId).distributionLimitCurrencyOf(
        _projectId,
        fundingCycle.configuration,
        terminal
      );

    // Convert the remaining to distribute into wei, if needed
    _leftToDistribute = _distributionLimitCurrency == JBCurrencies.ETH
      ? _leftToDistribute
      : PRBMathUD60x18.div(
        _leftToDistribute,
        prices.priceFor(_distributionLimitCurrency, JBCurrencies.ETH)
      );

    // The amount being withdrawn must be available in the overflow.
    if (_leftToDistribute > balanceOf[_projectId] || withdrawnAmount > balanceOf[_projectId] - _leftToDistribute) {
      revert INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();
    }

    // The amount being withdrawn must be at least as much as was expected.
    if (_minReturnedWei > withdrawnAmount) {
      revert INADEQUATE_WITHDRAW_AMOUNT();
    }

    // Store the incremented value.
    usedOverflowAllowanceOf[_projectId][fundingCycle.configuration] = _newUsedOverflowAllowanceOf;

    // Update the project's ETH balance.
    balanceOf[_projectId] = balanceOf[_projectId] - withdrawnAmount;
  }

  /**
    @notice
    Records newly redeemed tokens of a project.

    @dev
    Only the associated payment terminal can record a redemption.

    @param _holder The account that is having its tokens redeemed.
    @param _projectId The ID of the project to which the tokens being redeemed belong.
    @param _tokenCount The number of tokens to redeem.
    @param _minReturnedWei The minimum amount of wei expected in return.
    @param _beneficiary The address that will benefit from the claimed amount.
    @param _memo A memo to pass along to the emitted event.
    @param _delegateMetadata Bytes to send along to the delegate, if one is used.

    @return fundingCycle The funding cycle during which the redemption was made.
    @return reclaimAmount The amount of wei reclaimed.
    @return memo A memo that should be passed along to the emitted event.
  */
  function recordRedemptionFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _minReturnedWei,
    address payable _beneficiary,
    string memory _memo,
    bytes memory _delegateMetadata
  )
    external
    onlyAssociatedPaymentTerminal
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 reclaimAmount,
      string memory memo
    )
  {
    // The holder must have the specified number of the project's tokens.
    if (tokenStore.balanceOf(_holder, _projectId) < _tokenCount) {
      revert INSUFFICIENT_TOKENS();
    }

    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    if (fundingCycle.redeemPaused()) {
      revert FUNDING_CYCLE_REDEEM_PAUSED();
    }

    // Save a reference to the delegate to use.
    IJBRedemptionDelegate _delegate;

    // If the funding cycle has configured a data source, use it to derive a claim amount and memo.
    if (fundingCycle.useDataSourceForRedeem()) {
      (reclaimAmount, memo, _delegate, _delegateMetadata) = fundingCycle.dataSource().redeemParams(
        JBRedeemParamsData(
          _holder,
          _tokenCount,
          _projectId,
          fundingCycle.redemptionRate(),
          fundingCycle.ballotRedemptionRate(),
          _beneficiary,
          _memo,
          _delegateMetadata
        )
      );
    } else {
      reclaimAmount = _reclaimableOverflowOf(_projectId, fundingCycle, _tokenCount);
      memo = _memo;
    }

    // The amount being claimed must be within the project's balance.
    if (reclaimAmount > balanceOf[_projectId]) {
      revert INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE();
    }
    // The amount being claimed must be at least as much as was expected.
    if (reclaimAmount < _minReturnedWei) {
      revert INADEQUATE_CLAIM_AMOUNT();
    }

    // Redeem the tokens, which burns them.
    if (_tokenCount > 0)
      directory.controllerOf(_projectId).burnTokensOf(_holder, _projectId, _tokenCount, '', false);

    // Remove the redeemed funds from the project's balance.
    if (reclaimAmount > 0) balanceOf[_projectId] = balanceOf[_projectId] - reclaimAmount;

    // If a delegate was returned by the data source, issue a callback to it.
    if (_delegate != IJBRedemptionDelegate(address(0))) {
      JBDidRedeemData memory _data = JBDidRedeemData(
        _holder,
        _projectId,
        _tokenCount,
        reclaimAmount,
        _beneficiary,
        memo,
        _delegateMetadata
      );
      _delegate.didRedeem(_data);
      emit DelegateDidRedeem(_delegate, _data);
    }
  }

  /**
    @notice
    Records newly added funds for the project.

    @dev
    Only the associated payment terminal can record an added balance.

    @param _projectId The ID of the project to which the funds being added belong.
    @param _amount The amount added, in wei.

    @return fundingCycle The current funding cycle for the project.
  */
  function recordAddedBalanceFor(uint256 _projectId, uint256 _amount)
    external
    onlyAssociatedPaymentTerminal
    returns (JBFundingCycle memory fundingCycle)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Increment the balance.
    balanceOf[_projectId] = balanceOf[_projectId] + _amount;
  }

  /**
    @notice
    Records the migration of this terminal to another.

    @param _projectId The ID of the project being migrated.

    @return balance The project's current balance.
  */
  function recordMigration(uint256 _projectId)
    external
    onlyAssociatedPaymentTerminal
    returns (uint256 balance)
  {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Migration must be allowed
    if (!_fundingCycle.terminalMigrationAllowed()) {
      revert PAYMENT_TERMINAL_MIGRATION_NOT_ALLOWED();
    }

    // Return the current balance.
    balance = balanceOf[_projectId];

    // Set the balance to 0.
    balanceOf[_projectId] = 0;
  }

  /**
    @notice
    Allows this store to be claimed by an address so that it recognized the address as its terminal.
  */
  function claimFor(IJBTerminal _terminal) external {
    // This store can only be claimed once.
    if (terminal != IJBTerminal(address(0))) {
      revert STORE_ALREADY_CLAIMED();
    }
    // Set the terminal.
    terminal = _terminal;
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice
    See docs for `reclaimableOverflowOf`
  */
  function _reclaimableOverflowOf(
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _tokenCount
  ) private view returns (uint256) {
    // Get the amount of current overflow.
    // Use the local overflow if the funding cycle specifies that it should be used. Otherwise use the project's total overflow across all of its terminals.
    uint256 _currentOverflow = _fundingCycle.shouldUseLocalBalanceForRedemptions()
      ? _overflowDuring(_projectId, _fundingCycle)
      : _totalOverflowDuring(_projectId, _fundingCycle);

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
    This amount changes as the price of ETH changes in relation to the currency being used to measure the distribution limit.

    @param _projectId The ID of the project to get overflow for.
    @param _fundingCycle The ID of the funding cycle to base the overflow on.

    @return overflow The overflow of funds.
  */
  function _overflowDuring(uint256 _projectId, JBFundingCycle memory _fundingCycle)
    private
    view
    returns (uint256)
  {
    // Get the current balance of the project.
    uint256 _balanceOf = balanceOf[_projectId];

    // If there's no balance, there's no overflow.
    if (_balanceOf == 0) return 0;

    // Get a reference to the amount still withdrawable during the funding cycle.
    uint256 _distributionRemaining = directory.controllerOf(_projectId).distributionLimitOf(
      _projectId,
      _fundingCycle.configuration,
      terminal
    ) - usedDistributionLimitOf[_projectId][_fundingCycle.number];

    // Get a reference to the current funding cycle's currency for this terminal.
    uint256 _currency = directory.controllerOf(_projectId).distributionLimitCurrencyOf(
      _projectId,
      _fundingCycle.configuration,
      terminal
    );

    // Convert the _distributionRemaining to ETH.
    uint256 _ethDistributionRemaining = _distributionRemaining == 0
      ? 0
      : (_currency == JBCurrencies.ETH)
      ? _distributionRemaining
      : PRBMathUD60x18.div(_distributionRemaining, prices.priceFor(_currency, JBCurrencies.ETH));

    // Overflow is the balance of this project minus the amount that can still be distributed.
    return _balanceOf <= _ethDistributionRemaining ? 0 : _balanceOf - _ethDistributionRemaining;
  }

  /**
    @notice
    Gets the amount that is overflowing across all terminals when measured from the specified funding cycle.

    @dev
    This amount changes as the price of ETH changes in relation to the currency being used to measure the distribution limits.

    @param _projectId The ID of the project to get total overflow for.
    @param _fundingCycle The ID of the funding cycle to base the overflow on.

    @return overflow The overflow of funds.
  */
  function _totalOverflowDuring(uint256 _projectId, JBFundingCycle memory _fundingCycle)
    private
    view
    returns (uint256)
  {
    // Get a reference to the project's terminals.
    IJBTerminal[] memory _terminals = directory.terminalsOf(_projectId);

    // Keep a reference to the current eth balance of the project across all terminals, and the current eth distribution limit across all terminals.
    uint256 _ethBalanceOf;
    uint256 _ethDistributionLimitRemaining;

    for (uint256 _i = 0; _i < _terminals.length; _i++) {
      _ethBalanceOf = _ethBalanceOf + _terminals[_i].ethBalanceOf(_projectId);

      // Get a reference to the amount still withdrawable during the funding cycle.
      uint256 _distributionRemaining = _terminals[_i].remainingDistributionLimitOf(
        _projectId,
        _fundingCycle.configuration,
        _fundingCycle.number
      );

      // Get a reference to the current funding cycle's currency for this terminal.
      uint256 _currency = directory.controllerOf(_projectId).distributionLimitCurrencyOf(
        _projectId,
        _fundingCycle.configuration,
        _terminals[_i]
      );

      // Convert the _distributionRemaining to ETH.
      _ethDistributionLimitRemaining =
        _ethDistributionLimitRemaining +
        (
          _distributionRemaining == 0 ? 0 : (_currency == JBCurrencies.ETH)
            ? _distributionRemaining
            : PRBMathUD60x18.div(
              _distributionRemaining,
              prices.priceFor(_currency, JBCurrencies.ETH)
            )
        );
    }

    // Overflow is the balance of this project minus the amount that can still be distributed.
    return
      _ethBalanceOf <= _ethDistributionLimitRemaining
        ? 0
        : _ethBalanceOf - _ethDistributionLimitRemaining;
  }
}
