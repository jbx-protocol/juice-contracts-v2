// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
import '@paulrberg/contracts/math/PRBMath.sol';

import './interfaces/IJBPrices.sol';
import './interfaces/IJBTokenStore.sol';

import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

// Inheritance
import '@openzeppelin/contracts/access/Ownable.sol';

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
contract JBETHPaymentTerminalStore is Ownable {
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

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

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The amount of ETH that each project has.

    @dev
    [_projectId] 

    _projectId The ID of the project to get the balance of.

    @return The ETH balance of the specified project.
  */
  mapping(uint256 => uint256) public balanceOf;

  /**
    @notice 
    The amount of overflow that a project is allowed to tap into on-demand.

    @dev
    [_projectId][_configuration]

    _projectId The ID of the project to get the current overflow allowance of.
    _configuration The configuration of the during which the allowance applies.

    @return The current overflow allowance for the specified project configuration. Decreases as projects use of the allowance.
  */
  mapping(uint256 => mapping(uint256 => uint256)) public usedOverflowAllowanceOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the current overflowed amount for a specified project.

    @param _projectId The ID of the project to get overflow for.

    @return The current amount of overflow that project has.
  */
  function currentOverflowOf(uint256 _projectId) external view returns (uint256) {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // There's no overflow if there's no funding cycle.
    if (_fundingCycle.number == 0) return 0;

    return _overflowFrom(_fundingCycle);
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
    return _claimableOverflowOf(fundingCycleStore.currentOf(_projectId), _tokenCount);
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
    Records newly contributed ETH to a project made at the payment layer.

    @dev
    Mint's the project's tokens according to values provided by a configured data source. If no data source is configured, mints tokens proportional to the amount of the contribution.

    @dev
    The msg.value is the amount of the contribution in wei.

    @param _payer The original address that sent the payment to the payment layer.
    @param _amount The amount that is being paid.
    @param _projectId The ID of the project being contribute to.
    @param _preferClaimedTokensAndBeneficiary Two properties are included in this packed uint256:
      The first bit contains the flag indicating whether the request prefers to issue tokens unstaked rather than staked.
      The remaining bits contains the address that should receive benefits from the payment.

      This design is necessary two prevent a "Stack too deep" compiler error that comes up if the variables are declared seperately.
    @param _minReturnedTokens The minimum number of tokens expected in return.
    @param _memo A memo that will be included in the published event.
    @param _delegateMetadata Bytes to send along to the delegate, if one is provided.

    @return fundingCycle The funding cycle during which payment was made.
    @return weight The weight according to which new token supply was minted.
    @return tokenCount The number of tokens that were minted.
    @return memo A memo that should be included in the published event.
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
    onlyOwner
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
    require(fundingCycle.number > 0, 'NOT_FOUND');

    // Must not be paused.
    require(!fundingCycle.payPaused(), 'PAUSED');

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

    // Only print the tokens that are unreserved.
    tokenCount = PRBMath.mulDiv(_weightedAmount, 200 - fundingCycle.reservedRate(), 200);

    // The token count must be greater than or equal to the minimum expected.
    require(tokenCount >= _minReturnedTokens, 'INADEQUATE');

    // Add the amount to the balance of the project.
    balanceOf[_projectId] = balanceOf[_projectId] + _amount;

    if (_weightedAmount > 0)
      directory.controllerOf(_projectId).mintTokensOf(
        _projectId,
        tokenCount,
        address(uint160(_preferClaimedTokensAndBeneficiary >> 1)),
        'ETH received',
        (_preferClaimedTokensAndBeneficiary & 1) == 0,
        true
      );

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
    Records newly withdrawn funds for a project made at the payment layer.

    @param _projectId The ID of the project that is having funds withdrawn.
    @param _amount The amount being withdrawn. Send as wei (18 decimals).
    @param _currency The expected currency of the `_amount` being tapped. This must match the project's current funding cycle's currency.
    @param _minReturnedWei The minimum number of wei that should be withdrawn.

    @return fundingCycle The funding cycle during which the withdrawal was made.
    @return withdrawnAmount The amount withdrawn.
  */
  function recordWithdrawalFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei
  ) external onlyOwner returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount) {
    // Registers the funds as withdrawn and gets the ID of the funding cycle during which this withdrawal is being made.
    fundingCycle = directory.controllerOf(_projectId).signalWithdrawlFrom(_projectId, _amount);

    // Funds cannot be withdrawn if there's no funding cycle.
    require(fundingCycle.id > 0, 'NOT_FOUND');

    // The funding cycle must not be paused.
    require(!fundingCycle.tapPaused(), 'PAUSED');

    // Make sure the currencies match.
    require(_currency == fundingCycle.currency, 'UNEXPECTED_CURRENCY');

    // Convert the amount to wei.
    withdrawnAmount = PRBMathUD60x18.div(
      _amount,
      prices.priceFor(fundingCycle.currency, JBCurrencies.ETH)
    );

    // The amount being withdrawn must be at least as much as was expected.
    require(_minReturnedWei <= withdrawnAmount, 'INADEQUATE');

    // The amount being withdrawn must be available.
    require(withdrawnAmount <= balanceOf[_projectId], 'INSUFFICIENT_FUNDS');

    // Removed the withdrawn funds from the project's balance.
    balanceOf[_projectId] = balanceOf[_projectId] - withdrawnAmount;
  }

  /** 
    @notice 
    Records newly used allowance funds of a project made at the payment layer.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount of the allowance to use.

    @return fundingCycle The funding cycle during which the withdrawal is being made.
    @return withdrawnAmount The amount withdrawn.
  */
  function recordUsedAllowanceOf(
    uint256 _projectId,
    IJBTerminal _terminal,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei
  ) external onlyOwner returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount) {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Make sure the currencies match.
    require(_currency == fundingCycle.currency, 'UNEXPECTED_CURRENCY');

    // Convert the amount to wei.
    withdrawnAmount = PRBMathUD60x18.div(
      _amount,
      prices.priceFor(fundingCycle.currency, JBCurrencies.ETH)
    );

    // There must be sufficient allowance available.
    require(
      withdrawnAmount <=
        directory.controllerOf(_projectId).overflowAllowanceOf(
          _projectId,
          fundingCycle.configured,
          _terminal
        ) -
          usedOverflowAllowanceOf[_projectId][fundingCycle.configured],
      'NOT_ALLOWED'
    );

    // The amount being withdrawn must be at least as much as was expected.
    require(_minReturnedWei <= withdrawnAmount, 'INADEQUATE');

    // The amount being withdrawn must be available.
    require(withdrawnAmount <= balanceOf[_projectId], 'INSUFFICIENT_FUNDS');

    // Store the decremented value.
    usedOverflowAllowanceOf[_projectId][fundingCycle.configured] =
      usedOverflowAllowanceOf[_projectId][fundingCycle.configured] +
      withdrawnAmount;

    // Update the project's balance.
    balanceOf[_projectId] = balanceOf[_projectId] - withdrawnAmount;
  }

  /**
    @notice
    Records newly redeemed tokens of a project made at the payment layer.

    @param _holder The account that is having its tokens redeemed.
    @param _projectId The ID of the project to which the tokens being redeemed belong.
    @param _tokenCount The number of tokens to redeem.
    @param _minReturnedWei The minimum amount of wei expected in return.
    @param _beneficiary The address that will benefit from the claimed amount.
    @param _memo A memo to pass along to the emitted event.
    @param _delegateMetadata Bytes to send along to the delegate, if one is provided.

    @return fundingCycle The funding cycle during which the redemption was made.
    @return claimAmount The amount claimed.
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
    onlyOwner
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 claimAmount,
      string memory memo
    )
  {
    // The holder must have the specified number of the project's tokens.
    require(tokenStore.balanceOf(_holder, _projectId) >= _tokenCount, 'INSUFFICIENT_TOKENS');

    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // The current funding cycle must not be paused.
    require(!fundingCycle.redeemPaused(), 'PAUSED');

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
      claimAmount = _claimableOverflowOf(fundingCycle, _tokenCount);
      memo = _memo;
    }

    // The amount being claimed must be at least as much as was expected.
    require(claimAmount >= _minReturnedWei, 'INADEQUATE');

    // The amount being claimed must be within the project's balance.
    require(claimAmount <= balanceOf[_projectId], 'INSUFFICIENT_FUNDS');

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
    Records newly added funds for the project made at the payment layer.

    @dev
    Only the owner can record added balance.

    @param _projectId The ID of the project to which the funds being added belong.
    @param _amount The amount added, in wei.

    @return fundingCycle The current funding cycle for the project.
  */
  function recordAddedBalanceFor(uint256 _projectId, uint256 _amount)
    external
    onlyOwner
    returns (JBFundingCycle memory fundingCycle)
  {
    // Get a reference to the project's current funding cycle.
    fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Set the balance.
    balanceOf[_projectId] = balanceOf[_projectId] + _amount;
  }

  /** 
    @notice
    Records the migration of this terminal to another.

    @param _projectId The ID of the project being migrated.
    @param _to The terminal being migrated to.  
  */
  function recordMigration(uint256 _projectId, IJBTerminal _to) external onlyOwner {
    // Get a reference to the project's current funding cycle.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.currentOf(_projectId);

    // Migration must be allowed
    require(_fundingCycle.terminalMigrationAllowed(), 'TODO');

    // Set the balance to 0.
    balanceOf[_projectId] = 0;

    // Tell the controller to swap the terminals.
    directory.controllerOf(_projectId).swapTerminalOf(_projectId, _to);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice
    See docs for `claimableOverflowOf`
  */
  function _claimableOverflowOf(JBFundingCycle memory _fundingCycle, uint256 _tokenCount)
    private
    view
    returns (uint256)
  {
    // Get the amount of current overflow.
    uint256 _currentOverflow = _overflowFrom(_fundingCycle);

    // If there is no overflow, nothing is claimable.
    if (_currentOverflow == 0) return 0;

    // Get the total number of tokens in circulation.
    uint256 _totalSupply = tokenStore.totalSupplyOf(_fundingCycle.projectId);

    // Get the number of reserved tokens the project has.
    uint256 _reservedTokenAmount = directory
      .controllerOf(_fundingCycle.projectId)
      .reservedTokenBalanceOf(_fundingCycle.projectId, _fundingCycle.reservedRate());

    // If there are reserved tokens, add them to the total supply.
    if (_reservedTokenAmount > 0) _totalSupply = _totalSupply + _reservedTokenAmount;

    // If the amount being redeemed is the the total supply, return the rest of the overflow.
    if (_tokenCount == _totalSupply) return _currentOverflow;

    // Get a reference to the linear proportion.
    uint256 _base = PRBMath.mulDiv(_currentOverflow, _tokenCount, _totalSupply);

    // Use the ballot redemption rate if the queued cycle is pending approval according to the previous funding cycle's ballot.
    uint256 _redemptionRate = fundingCycleStore.currentBallotStateOf(_fundingCycle.projectId) ==
      JBBallotState.Active
      ? _fundingCycle.ballotRedemptionRate()
      : _fundingCycle.redemptionRate();

    // These conditions are all part of the same curve. Edge conditions are separated because fewer operation are necessary.
    if (_redemptionRate == 200) return _base;
    if (_redemptionRate == 0) return 0;
    return
      PRBMath.mulDiv(
        _base,
        _redemptionRate + PRBMath.mulDiv(_tokenCount, 200 - _redemptionRate, _totalSupply),
        200
      );
  }

  /**
    @notice
    Gets the amount that is overflowing if measured from the specified funding cycle.

    @dev
    This amount changes as the price of ETH changes in relation to the funding cycle's currency.

    @param _fundingCycle The ID of the funding cycle to base the overflow on.

    @return overflow The overflow of funds.
  */
  function _overflowFrom(JBFundingCycle memory _fundingCycle) private view returns (uint256) {
    // Get the current balance of the project.
    uint256 _balanceOf = balanceOf[_fundingCycle.projectId];

    // If there's no balance, there's no overflow.
    if (_balanceOf == 0) return 0;

    // Get a reference to the amount still withdrawable during the funding cycle.
    uint256 _limit = _fundingCycle.target - _fundingCycle.tapped;

    // Convert the limit to ETH.
    uint256 _ethLimit = _limit == 0
      ? 0 // Get the current price of ETH.
      : PRBMathUD60x18.div(_limit, prices.priceFor(_fundingCycle.currency, JBCurrencies.ETH));

    // Overflow is the balance of this project minus the amount that can still be withdrawn.
    return _balanceOf < _ethLimit ? 0 : _balanceOf - _ethLimit;
  }
}
