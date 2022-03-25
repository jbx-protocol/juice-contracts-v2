// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@paulrberg/contracts/math/PRBMath.sol';
import './../interfaces/IJBPayoutRedemptionPaymentTerminal.sol';
import './../libraries/JBConstants.sol';
import './../libraries/JBCurrencies.sol';
import './../libraries/JBOperations.sol';
import './../libraries/JBSplitsGroups.sol';
import './../libraries/JBTokens.sol';
import './../libraries/JBFixedPointNumber.sol';
import './../libraries/JBFundingCycleMetadataResolver.sol';
import './../structs/JBTokenAmount.sol';
import './JBOperatable.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error FEE_TOO_HIGH();
error PAY_TO_ZERO_ADDRESS();
error PROJECT_TERMINAL_MISMATCH();
error REDEEM_TO_ZERO_ADDRESS();
error TERMINAL_IN_SPLIT_ZERO_ADDRESS();
error TERMINAL_TOKENS_INCOMPATIBLE();
error ZERO_VALUE_SENT();
error NO_MSG_VALUE_ALLOWED();
error INADEQUATE_TOKEN_COUNT();
error INADEQUATE_DISTRIBUTION_AMOUNT();
error INADEQUATE_RECLAIM_AMOUNT();

/**
  @notice
  Generic terminal managing all inflows and outflows of funds into the protocol ecosystem.

  @dev
  A project can transfer its funds, along with the power to reconfigure and mint/burn their tokens, from this contract to another allowed terminal of the same token type contract at any time.

  @dev
  Adheres to:
  IJBPayoutRedemptionPaymentTerminal: General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.

  @dev
  Inherits from:
  JBOperatable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
  ReentrancyGuard: Contract module that helps prevent reentrant calls to a function.
*/
abstract contract JBPayoutRedemptionPaymentTerminal is
  IJBPayoutRedemptionPaymentTerminal,
  JBOperatable,
  Ownable,
  ReentrancyGuard
{
  // A library that parses the packed funding cycle metadata into a friendlier format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

  /** 
    @notice 
    A modifier that verifies this terminal is a terminal of provided project ID.
  */
  modifier isTerminalOf(uint256 _projectId) {
    if (!directory.isTerminalOf(_projectId, this)) revert PROJECT_TERMINAL_MISMATCH();
    _;
  }

  //*********************************************************************//
  // --------------------- private stored constants -------------------- //
  //*********************************************************************//

  /**
    @notice
    Maximum fee that can be set for a funding cycle configuration.

    @dev
    Out of MAX_FEE (50_000_000 / 1_000_000_000)
  */
  uint256 private constant _FEE_CAP = 50_000_000;

  /**
    @notice
    The protocol project ID is 1, as it should be the first project launched during the deployment process.
  */
  uint256 private constant _PROTOCOL_PROJECT_ID = 1;

  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /**
    @notice
    Fees that are being held to be processed later.

    _projectId The ID of the project for which fees are being held.
  */
  mapping(uint256 => JBFee[]) private _heldFeesOf;

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
    The contract that stores splits for each project.
  */
  IJBSplitsStore public immutable override splitsStore;

  /**
    @notice
    The contract that exposes price feeds.
  */
  IJBPrices public immutable override prices;

  /**
    @notice
    The contract that stores and manages the terminal's data.
  */
  IJBPaymentTerminalStore public immutable override store;

  /**
    @notice
    The token that this terminal accepts.
  */
  address public immutable override token;

  /**
    @notice
    The number of decimals the token fixed point amounts are expected to have.
  */
  uint256 public immutable override decimals;

  /**
    @notice
    The currency to use when resolving price feeds for this terminal.
  */
  uint256 public immutable override currency;

  /**
    @notice
    The currency to base token issuance on.

    @dev
    If this differs from `currency`, there must be a price feed available to convert `currency` to `baseWeightCurrency`.
  */
  uint256 public immutable override baseWeightCurrency;

  /**
    @notice
    The group that payout splits coming from this terminal are identified by.
  */
  uint256 public immutable override payoutSplitsGroup;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//
  /**
    @notice
    The platform fee percent.

    @dev
    Out of MAX_FEE (25_000_000 / 1_000_000_000)
  */
  uint256 public override fee = 25_000_000; // 2.5%

  /**
    @notice
    The data source that returns a discount to apply to a project's fee.
  */
  IJBFeeGauge public override feeGauge;

  /**
    @notice
    Terminals that can be paid towards from this terminal without incurring a fee.

    _terminal The terminal that can be paid toward.
  */
  mapping(IJBPaymentTerminal => bool) public override isFeelessTerminal;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the current overflowed amount in this terminal for a specified project, in terms of ETH.

    @dev
    The current overflow is represented as a fixed point number with 18 decimals.

    @param _projectId The ID of the project to get overflow for.

    @return The current amount of ETH overflow that project has in this terminal, as a fixed point number with 18 decimals.
  */
  function currentEthOverflowOf(uint256 _projectId) external view override returns (uint256) {
    // Get this terminal's current overflow.
    uint256 _overflow = store.currentOverflowOf(this, _projectId);

    // Adjust the decimals of the fixed point number if needed to have 18 decimals.
    uint256 _adjustedOverflow = (decimals == 18)
      ? _overflow
      : JBFixedPointNumber.adjustDecimals(_overflow, decimals, 18);

    // Return the amount converted to ETH.
    return
      (currency == JBCurrencies.ETH)
        ? _adjustedOverflow
        : PRBMath.mulDiv(
          _adjustedOverflow,
          10**decimals,
          prices.priceFor(currency, JBCurrencies.ETH, decimals)
        );
  }

  /**
    @notice
    The fees that are currently being held to be processed later for each project.

    @param _projectId The ID of the project for which fees are being held.

    @return An array of fees that are being held.
  */
  function heldFeesOf(uint256 _projectId) external view override returns (JBFee[] memory) {
    return _heldFeesOf[_projectId];
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /**
    @param _token The token that this terminal manages.
    @param _decimals The number of decimals the token fixed point amounts are expected to have.
    @param _currency The currency that this terminal's token adheres to for price feeds.
    @param _baseWeightCurrency The currency to base token issuance on.
    @param _payoutSplitsGroup The group that denotes payout splits from this terminal in the splits store.
    @param _operatorStore A contract storing operator assignments.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _splitsStore A contract that stores splits for each project.
    @param _prices A contract that exposes price feeds.
    @param _store A contract that stores the terminal's data.
    @param _owner The address that will own this contract.
  */
  constructor(
    address _token,
    uint256 _decimals,
    uint256 _currency,
    uint256 _baseWeightCurrency,
    uint256 _payoutSplitsGroup,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    IJBPrices _prices,
    IJBPaymentTerminalStore _store,
    address _owner
  ) JBOperatable(_operatorStore) {
    token = _token;
    decimals = _decimals;
    baseWeightCurrency = _baseWeightCurrency;
    payoutSplitsGroup = _payoutSplitsGroup;
    currency = _currency;
    projects = _projects;
    directory = _directory;
    splitsStore = _splitsStore;
    prices = _prices;
    store = _store;

    transferOwnership(_owner);
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Contribute tokens to a project.

    @param _amount The amount of terminal tokens being received, as a fixed point number with the same amount of decimals as this terminal. If this terminal's token is ETH, this is ignored and msg.value is used in its place.
    @param _projectId The ID of the project being paid.
    @param _beneficiary The address to mint tokens for and pass along to the funding cycle's delegate.
    @param _minReturnedTokens The minimum number of project tokens expected in return, as a fixed point number with the same amount of decimals as this terminal.
    @param _preferClaimedTokens A flag indicating whether the request prefers to mint project tokens into the beneficiaries wallet rather than leaving them unclaimed. This is only possible if the project has an attached token contract. Leaving them unclaimed saves gas.
    @param _memo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.  A data source can alter the memo before emitting in the event and forwarding to the delegate.
    @param _metadata Bytes to send along to the data source and delegate, if provided.
  */
  function pay(
    uint256 _amount,
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string calldata _memo,
    bytes calldata _metadata
  ) external payable virtual override isTerminalOf(_projectId) {
    // ETH shouldn't be sent if this terminal's token isn't ETH.
    if (token != JBTokens.ETH) {
      if (msg.value > 0) revert NO_MSG_VALUE_ALLOWED();

      // Transfer tokens to this terminal from the msg sender.
      _transferFrom(msg.sender, payable(address(this)), _amount);
    }
    // If this terminal's token is ETH, override _amount with msg.value.
    else _amount = msg.value;

    return
      _pay(
        _amount,
        msg.sender,
        _projectId,
        _beneficiary,
        _minReturnedTokens,
        _preferClaimedTokens,
        _memo,
        _metadata
      );
  }

  /**
    @notice
    Holders can redeem their tokens to claim the project's overflowed tokens, or to trigger rules determined by the project's current funding cycle's data source.

    @dev
    Only a token holder or a designated operator can redeem its tokens.

    @param _holder The account to redeem tokens for.
    @param _projectId The ID of the project to which the tokens being redeemed belong.
    @param _tokenCount The number of project tokens to redeem, as a fixed point number with 18 decimals.
    @param _minReturnedTokens The minimum amount of terminal tokens expected in return, as a fixed point number with 18 decimals.
    @param _beneficiary The address to send the terminal tokens to.
    @param _memo A memo to pass along to the emitted event.
    @param _metadata Bytes to send along to the data source and delegate, if provided.

    @return reclaimAmount The amount of terminal tokens that the project tokens were redeemed for, as a fixed point number with 18 decimals.
  */
  function redeemTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _minReturnedTokens,
    address payable _beneficiary,
    string memory _memo,
    bytes memory _metadata
  )
    external
    virtual
    override
    requirePermission(_holder, _projectId, JBOperations.REDEEM)
    returns (uint256 reclaimAmount)
  {
    // Can't send reclaimed funds to the zero address.
    if (_beneficiary == address(0)) revert REDEEM_TO_ZERO_ADDRESS();

    // Keep a reference to the funding cycle during which the redemption is being made.
    JBFundingCycle memory _fundingCycle;

    // Scoped section prevents stack too deep. `_delegate` only used within scope.
    {
      IJBRedemptionDelegate _delegate;

      // Record the redemption.
      (_fundingCycle, reclaimAmount, _delegate, _memo) = store.recordRedemptionFor(
        _holder,
        _projectId,
        _tokenCount,
        decimals, // The fixed point balance has this terminal's token's number of decimals.
        currency, // The balance is in terms of this terminal's currency.
        _memo,
        _metadata
      );

      // The amount being reclaimed must be at least as much as was expected.
      if (reclaimAmount < _minReturnedTokens) revert INADEQUATE_RECLAIM_AMOUNT();

      // Burn the project tokens.
      if (_tokenCount > 0)
        directory.controllerOf(_projectId).burnTokensOf(
          _holder,
          _projectId,
          _tokenCount,
          '',
          false
        );

      // If a delegate was returned by the data source, issue a callback to it.
      if (_delegate != IJBRedemptionDelegate(address(0))) {
        JBDidRedeemData memory _data = JBDidRedeemData(
          _holder,
          _projectId,
          _tokenCount,
          JBTokenAmount(token, reclaimAmount, decimals, currency),
          _beneficiary,
          _memo,
          _metadata
        );
        _delegate.didRedeem(_data);
        emit DelegateDidRedeem(_delegate, _data, msg.sender);
      }
    }

    // Send the reclaimed funds to the beneficiary.
    if (reclaimAmount > 0) _transferFrom(address(this), _beneficiary, reclaimAmount);

    emit RedeemTokens(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _holder,
      _beneficiary,
      _tokenCount,
      reclaimAmount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Distributes payouts for a project with the distribution limit of its current funding cycle.

    @dev
    Payouts are sent to the preprogrammed splits. Any leftover is sent to the project's owner.

    @dev
    Anyone can distribute payouts on a project's behalf. The project can preconfigure a wildcard split that is used to send funds to msg.sender. This can be used to incentivize calling this function.

    @dev
    All funds distributed outside of this contract or any feeless terminals incure the protocol fee.

    @param _projectId The ID of the project having its payouts distributed.
    @param _amount The amount of terminal tokens to distribute, as a fixed point number with same number of decimals as this terminal.
    @param _currency The expected currency of the amount being distributed. Must match the project's current funding cycle's distribution limit currency.
    @param _minReturnedTokens The minimum number of terminal tokens that the `_amount` should be valued at in terms of this terminal's currency, as a fixed point number with the same number of decimals as this terminal.
    @param _memo A memo to pass along to the emitted event.
  */
  function distributePayoutsOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedTokens,
    string calldata _memo
  ) external virtual override {
    // Record the distribution.
    (JBFundingCycle memory _fundingCycle, uint256 _distributedAmount) = store.recordDistributionFor(
        _projectId,
        _amount,
        _currency,
        currency // The balance is in terms of this terminal's currency.
      );

    // The amount being distributed must be at least as much as was expected.
    if (_distributedAmount < _minReturnedTokens) revert INADEQUATE_DISTRIBUTION_AMOUNT();

    // Get a reference to the project owner, which will receive tokens from paying the platform fee
    // and receive any extra distributable funds not allocated to payout splits.
    address payable _projectOwner = payable(projects.ownerOf(_projectId));

    // Define variables that will be needed outside the scoped section below.
    uint256 _fee;
    uint256 _leftoverDistributionAmount;

    // Scoped section prevents stack too deep. `_feeDiscount` and `_feeEligibleDistributionAmount` only used within scope.
    {
      // Get the amount of discount that should be applied to any fees taken.
      // If the fee is zero, set the discount to 100% for convinience.
      uint256 _feeDiscount = fee == 0
        ? JBConstants.MAX_FEE_DISCOUNT
        : _currentFeeDiscount(_projectId);

      // The amount distributed that is eligible for incurring fees.
      uint256 _feeEligibleDistributionAmount;

      // Payout to splits and get a reference to the leftover transfer amount after all splits have been paid.
      // Also get a reference to the amount that was distributed to splits from which fees should be taken.
      (_leftoverDistributionAmount, _feeEligibleDistributionAmount) = _distributeToPayoutSplitsOf(
        _projectId,
        _fundingCycle,
        _distributedAmount,
        _feeDiscount
      );

      // Leftover distribution amount is also eligible for a fee since the funds are going out of the ecosystem to _beneficiary.
      _feeEligibleDistributionAmount += _leftoverDistributionAmount;

      // Take the fee.
      _fee = _feeDiscount == JBConstants.MAX_FEE_DISCOUNT || _feeEligibleDistributionAmount == 0
        ? 0
        : _takeFeeFrom(
          _projectId,
          _fundingCycle,
          _feeEligibleDistributionAmount,
          _projectOwner,
          _feeDiscount
        );

      // Transfer any remaining balance to the project owner.
      if (_leftoverDistributionAmount > 0)
        _transferFrom(
          address(this),
          _projectOwner,
          _leftoverDistributionAmount - _feeAmount(_leftoverDistributionAmount, _feeDiscount)
        );
    }

    emit DistributePayouts(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _projectOwner,
      _amount,
      _distributedAmount,
      _fee,
      _leftoverDistributionAmount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Allows a project to send funds from its overflow up to the preconfigured allowance.

    @dev
    Only a project's owner or a designated operator can use its allowance.

    @dev
    Incurs the protocol fee.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount of terminal tokens to use from this project's current allowance, as a fixed point number with the same amount of decimals as this terminal.
    @param _currency The expected currency of the amount being distributed. Must match the project's current funding cycle's overflow allowance currency.
    @param _minReturnedTokens The minimum number of tokens that the `_amount` should be valued at in terms of this terminal's currency, as a fixed point number with 18 decimals.
    @param _beneficiary The address to send the funds to.
    @param _memo A memo to pass along to the emitted event.
  */
  function useAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedTokens,
    address payable _beneficiary,
    string memory _memo
  )
    external
    virtual
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.USE_ALLOWANCE)
  {
    // Record the use of the allowance.
    (JBFundingCycle memory _fundingCycle, uint256 _distributedAmount) = store.recordUsedAllowanceOf(
        _projectId,
        _amount,
        _currency,
        currency // The balance is in terms of this terminal's currency.
      );

    // The amount being withdrawn must be at least as much as was expected.
    if (_distributedAmount < _minReturnedTokens) revert INADEQUATE_DISTRIBUTION_AMOUNT();

    // Define variables that will be needed outside the scoped section below.
    uint256 _fee;

    // Scoped section prevents stack too deep. `_projectOwner`, `_feeDiscount`, and `_netAmount` only used within scope.
    {
      // Get a reference to the project owner, which will receive tokens from paying the platform fee.
      address _projectOwner = projects.ownerOf(_projectId);

      // Get the amount of discount that should be applied to any fees taken.
      // If the fee is zero, set the discount to 100% for convinience.
      uint256 _feeDiscount = fee == 0
        ? JBConstants.MAX_FEE_DISCOUNT
        : _currentFeeDiscount(_projectId);

      // Take a fee from the `_distributedAmount`, if needed.
      _fee = _feeDiscount == JBConstants.MAX_FEE_DISCOUNT
        ? 0
        : _takeFeeFrom(_projectId, _fundingCycle, _distributedAmount, _projectOwner, _feeDiscount);

      // The net amount is the withdrawn amount without the fee.
      uint256 _netAmount = _distributedAmount - _fee;

      // Transfer any remaining balance to the beneficiary.
      if (_netAmount > 0) _transferFrom(address(this), _beneficiary, _netAmount);
    }

    emit UseAllowance(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _beneficiary,
      _amount,
      _distributedAmount,
      _fee,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Allows a project owner to migrate its funds and operations to a new terminal of the same token type.

    @dev
    Only a project's owner or a designated operator can migrate it.

    @param _projectId The ID of the project being migrated.
    @param _to The terminal contract that will gain the project's funds.
  */
  function migrate(uint256 _projectId, IJBPaymentTerminal _to)
    external
    virtual
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.MIGRATE_TERMINAL)
  {
    // The terminal being migrated to must accept the same token as this terminal.
    if (token != _to.token()) revert TERMINAL_TOKENS_INCOMPATIBLE();

    // Record the migration in the store.
    uint256 _balance = store.recordMigration(_projectId);

    // Transfer the balance if needed.
    if (_balance > 0) {
      // Trigger any inherited pre-transfer logic.
      _beforeTransferTo(address(_to), _balance);

      // If this terminal's token is ETH, send it in msg.value.
      uint256 _payableValue = token == JBTokens.ETH ? _balance : 0;

      // Withdraw the balance to transfer to the new terminal;
      _to.addToBalanceOf{value: _payableValue}(_projectId, _balance, '');
    }

    emit Migrate(_projectId, _to, _balance, msg.sender);
  }

  /**
    @notice
    Receives funds belonging to the specified project.

    @param _projectId The ID of the project to which the funds received belong.
    @param _amount The amount of tokens to add, as a fixed point number with the same number of decimals as this terminal. If this is an ETH terminal, this is ignored and msg.value is used instead.
    @param _memo A memo to pass along to the emitted event.
  */
  function addToBalanceOf(
    uint256 _projectId,
    uint256 _amount,
    string calldata _memo
  ) external payable virtual override isTerminalOf(_projectId) {
    // If this terminal's token isn't ETH, make sure no msg.value was sent, then transfer the tokens in from msg.sender.
    if (token != JBTokens.ETH) {
      // Amount must be greater than 0.
      if (msg.value > 0) revert NO_MSG_VALUE_ALLOWED();

      // Transfer tokens to this terminal from the msg sender.
      _transferFrom(msg.sender, payable(address(this)), _amount);
    }
    // If the terminal's token is ETH, override `_amount` with msg.value.
    else _amount = msg.value;

    // Record the added funds.
    store.recordAddedBalanceFor(_projectId, _amount);

    // Refund any held fees to make sure the project doesn't pay double for funds going in and out of the protocol.
    _refundHeldFees(_projectId, _amount);

    emit AddToBalance(_projectId, _amount, _memo, msg.sender);
  }

  /**
    @notice
    Process any fees that are being held for the project.

    @dev
    Only a project owner, an operator, or the contract's owner can process held fees.

    @param _projectId The ID of the project whos held fees should be processed.
  */
  function processFees(uint256 _projectId)
    external
    virtual
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.PROCESS_FEES,
      msg.sender == owner()
    )
  {
    // Get a reference to the project's held fees.
    JBFee[] memory _heldFees = _heldFeesOf[_projectId];

    // Delete the held fees.
    delete _heldFeesOf[_projectId];

    // Process each fee.
    for (uint256 _i = 0; _i < _heldFees.length; _i++)
      _processFee(
        _heldFees[_i].amount -
          PRBMath.mulDiv(
            _heldFees[_i].amount,
            JBConstants.MAX_FEE,
            _heldFees[_i].fee + JBConstants.MAX_FEE
          ),
        _heldFees[_i].beneficiary
      );

    emit ProcessFees(_projectId, _heldFees, msg.sender);
  }

  /**
    @notice
    Allows the fee to be updated.

    @dev
    Only the owner of this contract can change the fee.

    @param _fee The new fee, out of MAX_FEE.
  */
  function setFee(uint256 _fee) external virtual override onlyOwner {
    // The provided fee must be within the max.
    if (_fee > _FEE_CAP) revert FEE_TOO_HIGH();

    // Store the new fee.
    fee = _fee;

    emit SetFee(_fee, msg.sender);
  }

  /**
    @notice
    Allows the fee gauge to be updated.

    @dev
    Only the owner of this contract can change the fee gauge.

    @dev
    If the fee gauge reverts when called upon while a project is attempting to distribute its funds, a project's funds will be locked. This is a known risk.

    @param _feeGauge The new fee gauge.
  */
  function setFeeGauge(IJBFeeGauge _feeGauge) external virtual override onlyOwner {
    // Store the new fee gauge.
    feeGauge = _feeGauge;

    emit SetFeeGauge(_feeGauge, msg.sender);
  }

  /**
    @notice
    Sets whether projects operating on this terminal can pay projects operating on the specified terminal without incurring a fee.

    @dev
    Only the owner of this contract can set terminal's as feeless.

    @param _terminal The terminal that can be paid towards while still bypassing fees.
    @param _flag A flag indicating whether the terminal should be feeless or not.
  */
  function setFeelessTerminal(IJBPaymentTerminal _terminal, bool _flag)
    external
    virtual
    override
    onlyOwner
  {
    // Set the flag value.
    isFeelessTerminal[_terminal] = _flag;

    emit SetFeelessTerminal(_terminal, _flag, msg.sender);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice
    Pays out splits for a project's funding cycle configuration.

    @param _projectId The ID of the project for which payout splits are being distributed.
    @param _fundingCycle The funding cycle during which the distribution is being made.
    @param _amount The total amount being distributed, as a fixed point number with the same number of decimals as this terminal.
    @param _feeDiscount The amount of discount to apply to the fee, out of the MAX_FEE.

    @return leftoverAmount If the leftover amount if the splits don't add up to 100%.
    @return feeEligibleDistributionAmount The total amount of distributions that are eligible to have fees taken from.
  */
  function _distributeToPayoutSplitsOf(
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _amount,
    uint256 _feeDiscount
  ) private returns (uint256 leftoverAmount, uint256 feeEligibleDistributionAmount) {
    // Set the leftover amount to the initial amount.
    leftoverAmount = _amount;

    // Get a reference to the project's payout splits.
    JBSplit[] memory _splits = splitsStore.splitsOf(
      _projectId,
      _fundingCycle.configuration,
      payoutSplitsGroup
    );

    //Transfer between all splits.
    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // Get a reference to the split being iterated on.
      JBSplit memory _split = _splits[_i];

      // The amount to send towards the split.
      uint256 _payoutAmount = PRBMath.mulDiv(
        _amount,
        _split.percent,
        JBConstants.SPLITS_TOTAL_PERCENT
      );

      // The payout amount substracting any applicable incurred fees.
      uint256 _netPayoutAmount;

      if (_payoutAmount > 0) {
        // Transfer tokens to the mod.
        // If there's an allocator set, transfer to its `allocate` function.
        if (_split.allocator != IJBSplitAllocator(address(0))) {
          _netPayoutAmount = _feeDiscount == JBConstants.MAX_FEE_DISCOUNT
            ? _payoutAmount
            : _payoutAmount - _feeAmount(_payoutAmount, _feeDiscount);

          // This distribution is eligible for a fee since the funds are leaving the ecosystem.
          feeEligibleDistributionAmount += _payoutAmount;

          // Trigger any inherited pre-transfer logic.
          _beforeTransferTo(address(_split.allocator), _netPayoutAmount);

          // If this terminal's token is ETH, send it in msg.value.
          uint256 _payableValue = token == JBTokens.ETH ? _netPayoutAmount : 0;

          // Create the data to send to the allocator.
          JBSplitAllocationData memory _data = JBSplitAllocationData(
            _netPayoutAmount,
            decimals,
            _projectId,
            payoutSplitsGroup,
            _split
          );

          // Trigger the allocator's `allocate` function.
          _split.allocator.allocate{value: _payableValue}(_data);

          // Otherwise, if a project is specified, make a payment to it.
        } else if (_split.projectId != 0) {
          // Get a reference to the Juicebox terminal being used.
          IJBPaymentTerminal _terminal = directory.primaryTerminalOf(_split.projectId, token);

          // The project must have a terminal to send funds to.
          if (_terminal == IJBPaymentTerminal(address(0))) revert TERMINAL_IN_SPLIT_ZERO_ADDRESS();

          // Save gas if this contract is being used as the terminal.
          if (_terminal == this) {
            // This distribution does not incur a fee.
            _netPayoutAmount = _payoutAmount;

            _pay(
              _netPayoutAmount,
              address(this),
              _split.projectId,
              _split.beneficiary,
              0,
              _split.preferClaimed,
              '',
              bytes('')
            );
          } else {
            // If the terminal is set as feeless, this distribution is not eligible for a fee.
            if (isFeelessTerminal[_terminal])
              _netPayoutAmount = _payoutAmount;
              // This distribution is eligible for a fee since the funds are leaving this contract and the terminal isn't listed as feeless.
            else {
              _netPayoutAmount = _feeDiscount == JBConstants.MAX_FEE_DISCOUNT
                ? _payoutAmount
                : _payoutAmount - _feeAmount(_payoutAmount, _feeDiscount);

              feeEligibleDistributionAmount += _payoutAmount;
            }

            // Trigger any inherited pre-transfer logic.
            _beforeTransferTo(address(_terminal), _netPayoutAmount);

            // If this terminal's token is ETH, send it in msg.value.
            uint256 _payableValue = token == JBTokens.ETH ? _netPayoutAmount : 0;

            _terminal.pay{value: _payableValue}(
              _netPayoutAmount,
              _split.projectId,
              _split.beneficiary,
              0,
              _split.preferClaimed,
              '',
              bytes('')
            );
          }
        } else {
          _netPayoutAmount = _feeDiscount == JBConstants.MAX_FEE_DISCOUNT
            ? _payoutAmount
            : _payoutAmount - _feeAmount(_payoutAmount, _feeDiscount);

          // This distribution is eligible for a fee since the funds are leaving the ecosystem.
          feeEligibleDistributionAmount += _payoutAmount;

          // If there's a beneficiary, send the funds directly to the beneficiary. Otherwise send to the msg.sender
          _transferFrom(
            address(this),
            _split.beneficiary != address(0) ? _split.beneficiary : payable(msg.sender),
            _netPayoutAmount
          );
        }

        // Subtract from the amount to be sent to the beneficiary.
        leftoverAmount = leftoverAmount - _payoutAmount;
      }

      emit DistributeToPayoutSplit(
        _fundingCycle.configuration,
        _fundingCycle.number,
        _projectId,
        _split,
        _netPayoutAmount,
        msg.sender
      );
    }
  }

  /**
    @notice
    Takes a fee into the platform's project, which has an id of _PROTOCOL_PROJECT_ID.

    @param _projectId The ID of the project having fees taken from.
    @param _fundingCycle The funding cycle during which the fee is being taken.
    @param _amount The amount of the fee to take, as a floating point number with 18 decimals.
    @param _beneficiary The address to mint the platforms tokens for.
    @param _feeDiscount The amount of discount to apply to the fee, out of the MAX_FEE.

    @return feeAmount The amount of the fee taken.
  */
  function _takeFeeFrom(
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _amount,
    address _beneficiary,
    uint256 _feeDiscount
  ) private returns (uint256 feeAmount) {
    feeAmount = _feeAmount(_amount, _feeDiscount);
    _fundingCycle.shouldHoldFees()
      ? _heldFeesOf[_projectId].push(JBFee(_amount, uint32(fee), _beneficiary))
      : _processFee(feeAmount, _beneficiary); // Take the fee.
  }

  /**
    @notice
    Process a fee of the specified amount.

    @param _amount The fee amount, as a floating point number with 18 decimals.
    @param _beneficiary The address to mint the platform's tokens for.
  */
  function _processFee(uint256 _amount, address _beneficiary) private {
    // Get the terminal for the protocol project.
    IJBPaymentTerminal _terminal = directory.primaryTerminalOf(_PROTOCOL_PROJECT_ID, token);

    // When processing the admin fee, save gas if the admin is using this contract as its terminal.
    if (_terminal == this)
      _pay(_amount, address(this), _PROTOCOL_PROJECT_ID, _beneficiary, 0, false, '', bytes('')); // Use the local pay call.
    else {
      // Trigger any inherited pre-transfer logic.
      _beforeTransferTo(address(_terminal), _amount);

      // If this terminal's token is ETH, send it in msg.value.
      uint256 _payableValue = token == JBTokens.ETH ? _amount : 0;

      // Send the payment.
      _terminal.pay{value: _payableValue}(
        _amount,
        _PROTOCOL_PROJECT_ID,
        _beneficiary,
        0,
        false,
        '',
        bytes('')
      ); // Use the external pay call of the correct terminal.
    }
  }

  /**
    @notice
    Contribute tokens to a project.

    @param _amount The amount of terminal tokens being received, as a fixed point number with the same amount of decimals as this terminal. If this terminal's token is ETH, this is ignored and msg.value is used in its place.
    @param _payer The address making the payment.
    @param _projectId The ID of the project being paid.
    @param _beneficiary The address to mint tokens for and pass along to the funding cycle's delegate.
    @param _minReturnedTokens The minimum number of project tokens expected in return, as a fixed point number with the same amount of decimals as this terminal.
    @param _preferClaimedTokens A flag indicating whether the request prefers to mint project tokens into the beneficiaries wallet rather than leaving them unclaimed. This is only possible if the project has an attached token contract. Leaving them unclaimed saves gas.
    @param _memo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.  A data source can alter the memo before emitting in the event and forwarding to the delegate.
    @param _metadata Bytes to send along to the data source and delegate, if provided.
  */
  function _pay(
    uint256 _amount,
    address _payer,
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) private {
    // Cant send tokens to the zero address.
    if (_beneficiary == address(0)) revert PAY_TO_ZERO_ADDRESS();

    JBFundingCycle memory _fundingCycle;
    uint256 _beneficiaryTokenCount;

    // Scoped section prevents stack too deep. `_delegate` and `_tokenCount` only used within scope.
    {
      IJBPayDelegate _delegate;
      uint256 _tokenCount;

      // Bundle the amount info into a JBTokenAmount struct.
      JBTokenAmount memory _bundledAmount = JBTokenAmount(token, _amount, decimals, currency);

      // Record the payment.
      (_fundingCycle, _tokenCount, _delegate, _memo) = store.recordPaymentFrom(
        _payer,
        _bundledAmount,
        _projectId,
        baseWeightCurrency,
        _memo,
        _metadata
      );

      // Mint the tokens if needed.
      if (_tokenCount > 0)
        // Set token count to be the number of tokens minted for the beneficiary instead of the total amount.
        _beneficiaryTokenCount = directory.controllerOf(_projectId).mintTokensOf(
          _projectId,
          _tokenCount,
          _beneficiary,
          '',
          _preferClaimedTokens,
          true
        );

      // The token count for the beneficiary must be greater than or equal to the minimum expected.
      if (_beneficiaryTokenCount < _minReturnedTokens) revert INADEQUATE_TOKEN_COUNT();

      // If a delegate was returned by the data source, issue a callback to it.
      if (_delegate != IJBPayDelegate(address(0))) {
        JBDidPayData memory _data = JBDidPayData(
          _payer,
          _projectId,
          _bundledAmount,
          _beneficiaryTokenCount,
          _beneficiary,
          _memo,
          _metadata
        );

        _delegate.didPay(_data);
        emit DelegateDidPay(_delegate, _data, msg.sender);
      }
    }

    emit Pay(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _beneficiary,
      _amount,
      _beneficiaryTokenCount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Refund fees based on the specified amount.

    @param _projectId The project for which fees are being refunded.
    @param _amount The amount to base the refund on, as a fixed point number with the same amount of decimals as this terminal.
  */
  function _refundHeldFees(uint256 _projectId, uint256 _amount) private {
    // Get a reference to the project's held fees.
    JBFee[] memory _heldFees = _heldFeesOf[_projectId];

    // Delete the current held fees.
    delete _heldFeesOf[_projectId];

    // Process each fee.
    for (uint256 _i = 0; _i < _heldFees.length; _i++) {
      if (_amount == 0) _heldFeesOf[_projectId].push(_heldFees[_i]);
      else if (_amount >= _heldFees[_i].amount) _amount = _amount - _heldFees[_i].amount;
      else {
        _heldFeesOf[_projectId].push(
          JBFee(_heldFees[_i].amount - _amount, _heldFees[_i].fee, _heldFees[_i].beneficiary)
        );
        _amount = 0;
      }
    }
  }

  /** 
    @notice 
    Returns the fee amount based on the provided amount for the specified project.

    @param _amount The amount that the fee is based on, as a fixed point number with the same amount of decimals as this terminal.
    @param _feeDiscount The percentage discount that should be applied out of the max amount, out of MAX_FEE_DISCOUNT.

    @return The amount of the fee, as a fixed point number with the same amount of decimals as this terminal.
  */
  function _feeAmount(uint256 _amount, uint256 _feeDiscount) private view returns (uint256) {
    // Calculate the discounted fee.
    uint256 _discountedFee = fee - PRBMath.mulDiv(fee, _feeDiscount, JBConstants.MAX_FEE_DISCOUNT);

    // The amount of tokens from the `_amount` to pay as a fee.
    return
      _amount - PRBMath.mulDiv(_amount, JBConstants.MAX_FEE, _discountedFee + JBConstants.MAX_FEE);
  }

  /** 
    @notice
    Get the fee discount from the fee gauge for the specified project.

    @param _projectId The ID of the project to get a fee discount for.
    
    @return feeDiscount The fee discount, which should be interpreted as a percentage out MAX_FEE_DISCOUNT.
  */
  function _currentFeeDiscount(uint256 _projectId) private view returns (uint256 feeDiscount) {
    // Can't take a fee if the protocol project doesn't have a terminal that accepts the token.
    if (directory.primaryTerminalOf(_PROTOCOL_PROJECT_ID, token) == IJBPaymentTerminal(address(0)))
      return JBConstants.MAX_FEE_DISCOUNT;

    // Get the fee discount.
    if (feeGauge == IJBFeeGauge(address(0)))
      feeDiscount = 0;
      // If the guage reverts, set the discount to 0.
    else
      try feeGauge.currentDiscountFor(_projectId) returns (uint256 discount) {
        feeDiscount = discount;
      } catch {
        feeDiscount = 0;
      }

    // If the fee discount is greater than the max, nullify the discount.
    if (feeDiscount > JBConstants.MAX_FEE_DISCOUNT) feeDiscount = 0;
  }

  /** 
    @notice
    Transfers tokens.

    @param _from The address from which the transfer should originate.
    @param _to The address to which the transfer should go.
    @param _amount The amount of the transfer, as a fixed point number with the same number of decimals as this terminal.
  */
  function _transferFrom(
    address _from,
    address payable _to,
    uint256 _amount
  ) internal virtual;

  /** 
    @notice
    Logic to be triggered before transferring tokens from this terminal.

    @param _to The address to which the transfer is going.
    @param _amount The amount of the transfer, as a fixed point number with the same number of decimals as this terminal.
  */
  function _beforeTransferTo(address _to, uint256 _amount) internal virtual;
}
