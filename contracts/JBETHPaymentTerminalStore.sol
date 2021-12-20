// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
import '@paulrberg/contracts/math/PRBMath.sol';

import './interfaces/IJBPrices.sol';
import './interfaces/IJBTokenStore.sol';
import './interfaces/IJBTerminal.sol';

import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

/**
  @notice
  This contract manages all inflows and outflows of funds into the Juicebox ecosystem.

  @dev 
  A project can transfer its funds, along with the power to reconfigure and mint/burn their tokens, from this contract to another allowed terminal contract at any time.

  Inherits from:

  IJBPaymentTerminal - general interface for the methods in this contract that send and receive funds according to the Juicebox protocol's rules.
  JBOperatable - several functions in this contract can only be accessed by a project owner, or an address that has been preconfifigured to be an operator of the project.
  ReentrencyGuard - several function in this contract shouldn't be accessible recursively.
*/
contract JBETHPaymentTerminalStore {
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  // A modifier only allowing the associated payment terminal to access the function.
  modifier onlyAssociatedPaymentTerminal() {
    require(msg.sender == address(terminal), '0x3a: UNAUTHORIZED');
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
    The amount of overflow that a project has used from its allowance during the current funding cycle configuration. 

    @dev 
    Increases as projects use their allowance.

    _projectId The ID of the project to get the used overflow allowance of.
    _configuration The configuration of the during which the allowance applies.
  */
  mapping(uint256 => mapping(uint256 => uint256)) public usedOverflowAllowanceOf;

  /**
    @notice 
    The amount that a project has distributed from its limit during the current funding cycle. 

    @dev 
    Increases as projects use their distribution limit.

    _projectId The ID of the project to get the used distribution limit of.
    _configuration The configuration of the during which the disitrution limit applies.
  */
  mapping(uint256 => mapping(uint256 => uint256)) public usedDistributionLimitOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the current overflowed amount in this terminal for a specified project.

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
    Gets the current overflowed amount for a specified project across all terminals.

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
    The amount of overflowed ETH that can be claimed by the specified number of tokens.

    @dev If the project has an active funding cycle reconfiguration ballot, the project's ballot redemption rate is used.

    @param _projectId The ID of the project to get a claimable amount for.
    @param _tokenCount The number of tokens to make the calculation with. 

    @return The amount of overflowed ETH that can be claimed.
  */
  function claimableOverflowOf(uint256 _projectId, uint256 _tokenCount)
    external
    view
    returns (uint256)
  {
    return _claimableOverflowOf(_projectId, fundingCycleStore.currentOf(_projectId), _tokenCount);
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
    @param _amount The amount that is being paid.
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
    require(fundingCycle.number > 0, '0x3a: NOT_FOUND');

    // Must not be paused.
    require(!fundingCycle.payPaused(), '0x3b: PAUSED');

    // Save a reference to the delegate to use.
    IJBPayDelegate _delegate;

    // If the funding cycle has configured a data source, use it to derive a weight and memo.
    if (fundingCycle.useDataSourceForPay()) {
      (weight, memo, _delegate, _delegateMetadata) = fundingCycle.dataSource().payParams(
        JBPayParamsData(
          _payer,
          _amount,
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

    // Multiply the amount by the weight to determine the amount of tokens to mint.
    uint256 _weightedAmount = PRBMathUD60x18.mul(_amount, weight);

    // Add the amount to the balance of the project if needed.
    if (_amount > 0) balanceOf[_projectId] = balanceOf[_projectId] + _amount;

    if (_weightedAmount > 0)
      tokenCount = directory.controllerOf(_projectId).mintTokensOf(
        _projectId,
        _weightedAmount,
        address(uint160(_preferClaimedTokensAndBeneficiary >> 1)),
        'ETH received',
        (_preferClaimedTokensAndBeneficiary & 1) == 0,
        fundingCycle.reservedRate()
      );

    // The token count for the beneficiary must be greater than or equal to the minimum expected.
    require(tokenCount >= _minReturnedTokens, '0x3c: INADEQUATE');

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
    @param _amount The amount being distributed. Send as wei (18 decimals).
    @param _currency The expected currency of the `_amount` being tapped. This must match the project's current funding cycle's currency.
    @param _minReturnedWei The minimum number of wei that should be distributed.

    @return fundingCycle The funding cycle during which the withdrawal was made.
    @return distributedAmount The amount distribution.
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
    require(!fundingCycle.distributionsPaused(), '0x3e: PAUSED');

    // Make sure the currencies match.
    require(
      _currency ==
        directory.controllerOf(_projectId).distributionLimitCurrencyOf(
          _projectId,
          fundingCycle.configuration,
          terminal
        ),
      '0x3f: UNEXPECTED_CURRENCY'
    );

    // The new total amount that has been distributed during this funding cycle.
    uint256 _newUsedDistributionLimitOf = usedDistributionLimitOf[_projectId][fundingCycle.number] +
      _amount;

    // Amount must be within what is still distributable.
    require(
      _newUsedDistributionLimitOf <=
        directory.controllerOf(_projectId).distributionLimitOf(
          _projectId,
          fundingCycle.configuration,
          terminal
        ),
      '0x1b: LIMIT_REACHED'
    );

    // Convert the amount to wei.
    // A currency of 0 should be interpreted as whatever the currency being distributed is.
    distributedAmount = _currency == 0
      ? _amount
      : PRBMathUD60x18.div(_amount, prices.priceFor(_currency, JBCurrencies.ETH));

    // The amount being distributed must be available.
    require(distributedAmount <= balanceOf[_projectId], '0x40: INSUFFICIENT_FUNDS');

    // The amount being distributed must be at least as much as was expected.
    require(_minReturnedWei <= distributedAmount, '0x41: INADEQUATE');

    // Store the new amount.
    usedDistributionLimitOf[_projectId][fundingCycle.number] = _newUsedDistributionLimitOf;

    // Removed the distributed funds from the project's balance.
    balanceOf[_projectId] = balanceOf[_projectId] - distributedAmount;
  }

  /** 
    @notice 
    Records newly used allowance funds of a project.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount of the allowance to use.
    @param _currency The currency of the `_amount` value. Must match the funding cycle's currency.
    @param _minReturnedWei The amount of wei that is expected to be withdrawn.

    @return fundingCycle The funding cycle during which the withdrawal is being made.
    @return withdrawnAmount The amount withdrawn.
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

    // Make sure the currencies match.
    require(
      _currency ==
        directory.controllerOf(_projectId).overflowAllowanceCurrencyOf(
          _projectId,
          fundingCycle.configuration,
          terminal
        ),
      '0x42: UNEXPECTED_CURRENCY'
    );

    // Convert the amount to wei.
    // A currency of 0 should be interpreted as whatever the currency being withdrawn is.
    withdrawnAmount = _currency == 0
      ? _amount
      : PRBMathUD60x18.div(_amount, prices.priceFor(_currency, JBCurrencies.ETH));

    // There must be sufficient allowance available.
    require(
      withdrawnAmount <=
        directory.controllerOf(_projectId).overflowAllowanceOf(
          _projectId,
          fundingCycle.configuration,
          terminal
        ) -
          usedOverflowAllowanceOf[_projectId][fundingCycle.configuration],
      '0x43: NOT_ALLOWED'
    );

    // The amount being withdrawn must be available.
    require(withdrawnAmount <= balanceOf[_projectId], '0x44: INSUFFICIENT_FUNDS');

    // The amount being withdrawn must be at least as much as was expected.
    require(_minReturnedWei <= withdrawnAmount, '0x45: INADEQUATE');

    // Store the decremented value.
    usedOverflowAllowanceOf[_projectId][fundingCycle.configuration] =
      usedOverflowAllowanceOf[_projectId][fundingCycle.configuration] +
      withdrawnAmount;

    // Update the project's balance.
    balanceOf[_projectId] = balanceOf[_projectId] - withdrawnAmount;
  }

  /**
    @notice
    Records newly redeemed tokens of a project.

    @dev 
    Only the associated payment terminal can record a redemption.

    @param _holder The account that is having its tokens redeemed.
    @param _projectId The ID of the project to which the tokens being redeemed belong.
    @param _tokenCount The number of tokens to redeemed.
    @param _minReturnedWei The minimum amount of wei expected in return.
    @param _beneficiary The address that will benefit from the claimed amount.
    @param _memo A memo to pass along to the emitted event.
    @param _delegateMetadata Bytes to send along to the delegate, if one is used.

    @return fundingCycle The funding cycle during which the redemption was made.
    @return claimAmount The amount of wei claimed.
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
      uint256 claimAmount,
      string memory memo
    )
  {
    // The holder must have the specified number of the project's tokens.
    require(tokenStore.balanceOf(_holder, _projectId) >= _tokenCount, '0x46: INSUFFICIENT_TOKENS');

    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    require(!fundingCycle.redeemPaused(), '0x47: PAUSED');

    // Save a reference to the delegate to use.
    IJBRedemptionDelegate _delegate;

    // If the funding cycle has configured a data source, use it to derive a claim amount and memo.
    if (fundingCycle.useDataSourceForRedeem()) {
      (claimAmount, memo, _delegate, _delegateMetadata) = fundingCycle.dataSource().redeemParams(
        JBRedeemParamsData(
          _holder,
          _tokenCount,
          fundingCycle.redemptionRate(),
          fundingCycle.ballotRedemptionRate(),
          _beneficiary,
          _memo,
          _delegateMetadata
        )
      );
    } else {
      claimAmount = _claimableOverflowOf(_projectId, fundingCycle, _tokenCount);
      memo = _memo;
    }

    // The amount being claimed must be within the project's balance.
    require(claimAmount <= balanceOf[_projectId], '0x48: INSUFFICIENT_FUNDS');

    // The amount being claimed must be at least as much as was expected.
    require(claimAmount >= _minReturnedWei, '0x49: INADEQUATE');

    // Redeem the tokens, which burns them.
    if (_tokenCount > 0)
      directory.controllerOf(_projectId).burnTokensOf(
        _holder,
        _projectId,
        _tokenCount,
        'Redeem for ETH',
        true
      );

    // Remove the redeemed funds from the project's balance.
    if (claimAmount > 0) balanceOf[_projectId] = balanceOf[_projectId] - claimAmount;

    // If a delegate was returned by the data source, issue a callback to it.
    if (_delegate != IJBRedemptionDelegate(address(0))) {
      JBDidRedeemData memory _data = JBDidRedeemData(
        _holder,
        _projectId,
        _tokenCount,
        claimAmount,
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
    require(_fundingCycle.terminalMigrationAllowed(), '0x4a: NOT_ALLOWED');

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
    require(terminal == IJBTerminal(address(0)), '0x4b: ALREADY_CLAIMED');

    // Set the terminal.
    terminal = _terminal;
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice
    See docs for `claimableOverflowOf`
  */
  function _claimableOverflowOf(
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

    // If the amount being redeemed is the the total supply, return the rest of the overflow.
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
    if (_redemptionRate == 10000) return _base;
    return
      PRBMath.mulDiv(
        _base,
        _redemptionRate + PRBMath.mulDiv(_tokenCount, 10000 - _redemptionRate, _totalSupply),
        10000
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
      ? 0 // Get the current price of ETH. // A currency of 0 should be interpreted as whatever the currency being withdrawn is.
      : _currency == 0
      ? _distributionRemaining
      : PRBMathUD60x18.div(_distributionRemaining, prices.priceFor(_currency, JBCurrencies.ETH));

    // Overflow is the balance of this project minus the amount that can still be distributed.
    return _balanceOf < _ethDistributionRemaining ? 0 : _balanceOf - _ethDistributionRemaining;
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
          _distributionRemaining == 0
            ? 0 // Get the current price of ETH. // A currency of 0 should be interpreted as whatever the currency being withdrawn is.
            : _currency == 0
            ? _distributionRemaining
            : PRBMathUD60x18.div(
              _distributionRemaining,
              prices.priceFor(_currency, JBCurrencies.ETH)
            )
        );
    }

    // Overflow is the balance of this project minus the amount that can still be distributed.
    return
      _ethBalanceOf < _ethDistributionLimitRemaining
        ? 0
        : _ethBalanceOf - _ethDistributionLimitRemaining;
  }
}
