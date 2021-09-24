// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
import '@paulrberg/contracts/math/PRBMath.sol';

import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

// Inheritance
import './interfaces/IJBETHPaymentTerminal.sol';
import './interfaces/IJBTerminal.sol';
import './abstract/JBOperatable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

/**
  @notice
  This contract manages all inflows and outflows of funds into the Juicebox ecosystem. It stores all treasury funds for all projects.

  @dev 
  A project can transfer its funds, along with the power to reconfigure and mint/burn their tokens, from this contract to another allowed terminal contract at any time.

  Inherits from:

  IJBPaymentTerminal - general interface for the methods in this contract that send and receive funds according to the Juicebox protocol's rules.
  JBOperatable - several functions in this contract can only be accessed by a project owner, or an address that has been preconfifigured to be an operator of the project.
  ReentrencyGuard - several function in this contract shouldn't be accessible recursively.
*/
contract JBETHPaymentTerminal is
  IJBETHPaymentTerminal,
  IJBTerminal,
  JBOperatable,
  Ownable,
  ReentrancyGuard
{
  // A library that parses the packed funding cycle metadata into a more friendly format.
  using JBFundingCycleMetadataResolver for JBFundingCycle;

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

  /** 
    @notice 
    The contract that exposes price feeds.
  */
  IJBPrices public immutable override prices;

  /** 
    @notice 
    The controller that manages how terminals interact with tokens and funding cycles.
  */
  IJBController public immutable override jb;

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
  mapping(uint256 => uint256) public override balanceOf;

  /**
    @notice 
    The amount of overflow that a project is allowed to tap into on-demand.

    @dev
    [_projectId][_configuration]

    _projectId The ID of the project to get the current overflow allowance of.
    _configuration The configuration of the during which the allowance applies.

    @return The current overflow allowance for the specified project configuration. Decreases as projects use of the allowance.
  */
  mapping(uint256 => mapping(uint256 => uint256)) public override usedOverflowAllowanceOf;

  uint256 public immutable override domain = 0;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    Gets the current overflowed amount for a specified project.

    @param _projectId The ID of the project to get overflow for.

    @return The current amount of overflow that project has.
  */
  function currentOverflowOf(uint256 _projectId) external view override returns (uint256) {
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
    override
    returns (uint256)
  {
    return _claimableOverflowOf(fundingCycleStore.currentOf(_projectId), _tokenCount);
  }

  function currentETHBalanceOf(uint256 _projectId) external view override returns (uint256) {
    return balanceOf[_projectId];
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _jb The controller that manages how terminals interact with tokens and funding cycles..
    @param _fundingCycleStore The contract storing all funding cycle configurations.
    @param _tokenStore The contract that manages token minting and burning.
    @param _prices The contract that exposes price feeds.
    @param _projects A Projects contract which mints ERC-721's that represent project ownership and transfers.
    @param _splitsStore The contract that stores splits for each project.
    @param _directory The directory of terminals.
    @param _operatorStore A contract storing operator assignments.
  */
  constructor(
    IJBController _jb,
    IJBFundingCycleStore _fundingCycleStore,
    IJBTokenStore _tokenStore,
    IJBPrices _prices,
    IJBProjects _projects,
    IJBSplitsStore _splitsStore,
    IJBDirectory _directory,
    IJBOperatorStore _operatorStore
  ) JBOperatable(_operatorStore) {
    jb = _jb;
    fundingCycleStore = _fundingCycleStore;
    tokenStore = _tokenStore;
    prices = _prices;
    projects = _projects;
    splitsStore = _splitsStore;
    directory = _directory;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Contribute ETH to a project.

    @dev
    The msg.value is the amount of the contribution in wei.

    @param _projectId The ID of the project being contribute to.
    @param _beneficiary The address to mint tokens for and pass along to the funding cycle's data source and delegate.
    @param _minReturnedTokens The minimum number of tokens expected in return.
    @param _preferUnstakedTokens A flag indicating whether the request prefers to issue tokens unstaked rather than staked.
    @param _memo A memo that will be included in the published event, and passed along the the funding cycle's data source and delegate.
    @param _delegateMetadata Bytes to send along to the delegate, if one is provided.

    @return The number of the funding cycle that the payment was made during.
  */
  function pay(
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferUnstakedTokens,
    string calldata _memo,
    bytes calldata _delegateMetadata
  ) external payable override returns (uint256) {
    return
      _pay(
        msg.value,
        _projectId,
        _beneficiary,
        _minReturnedTokens,
        _preferUnstakedTokens,
        _memo,
        _delegateMetadata
      );
  }

  /**
    @notice 
    Distributes payouts for a project according to the constraints of its current funding cycle.
    Payouts are sent to the preprogrammed splits. 

    @dev
    Anyone can distribute payouts on a project's behalf.

    @param _projectId The ID of the project having its payouts distributed.
    @param _amount The amount being distributed.
    @param _currency The expected currency of the amount being distributed. Must match the project's current funding cycle's currency.
    @param _minReturnedWei The minimum number of wei that the amount should be valued at.

    @return The ID of the funding cycle during which the distribution was made.
  */
  function distributePayoutsOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei,
    string memory _memo
  ) external override nonReentrant returns (uint256) {
    // Record the withdrawal in the data layer.
    (JBFundingCycle memory _fundingCycle, uint256 _withdrawnAmount) = _recordWithdrawalFor(
      _projectId,
      _amount,
      _currency,
      _minReturnedWei
    );

    // Get a reference to the project owner, which will receive tokens from paying the platform fee
    // and receive any extra distributable funds not allocated to payout splits.
    address payable _projectOwner = payable(projects.ownerOf(_projectId));

    // Get a reference to the handle of the project paying the fee and sending payouts.
    bytes32 _handle = projects.handleOf(_projectId);

    // Take a fee from the _withdrawnAmount, if needed.
    // The project's owner will be the beneficiary of the resulting minted tokens from platform project.
    // The platform project's ID is 1.
    uint256 _feeAmount = _fundingCycle.fee == 0 || _projectId == 1
      ? 0
      : _takeFeeFrom(
        _withdrawnAmount,
        _fundingCycle.fee,
        _projectOwner,
        string(bytes.concat('Fee from @', _handle))
      );

    // Payout to splits and get a reference to the leftover transfer amount after all mods have been paid.
    // The net transfer amount is the withdrawn amount minus the fee.
    uint256 _leftoverTransferAmount = _distributeToPayoutSplitsOf(
      _fundingCycle,
      _withdrawnAmount - _feeAmount,
      string(bytes.concat('Payout from @', _handle))
    );

    // Transfer any remaining balance to the project owner.
    if (_leftoverTransferAmount > 0) Address.sendValue(_projectOwner, _leftoverTransferAmount);

    emit DistributePayouts(
      _fundingCycle.id,
      _projectId,
      _projectOwner,
      _amount,
      _withdrawnAmount,
      _feeAmount,
      _leftoverTransferAmount,
      _memo,
      msg.sender
    );

    return _fundingCycle.id;
  }

  /**
    @notice 
    Allows a project to send funds from its overflow up to the preconfigured allowance.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount of the allowance to use.
    @param _beneficiary The address to send the funds to.

    @return The ID of the funding cycle during which the allowance was use.
  */
  function useAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei,
    address payable _beneficiary
  )
    external
    override
    nonReentrant
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.USE_ALLOWANCE)
    returns (uint256)
  {
    // Record the use of the allowance in the data layer.
    (JBFundingCycle memory _fundingCycle, uint256 _withdrawnAmount) = _recordUsedAllowanceOf(
      _projectId,
      _amount,
      _currency,
      _minReturnedWei
    );

    // Get a reference to the project owner, which will receive tokens from paying the platform fee
    // and receive any extra distributable funds not allocated to payout splits.
    address payable _projectOwner = payable(projects.ownerOf(_projectId));

    // Get a reference to the handle of the project paying the fee and sending payouts.
    bytes32 _handle = projects.handleOf(_projectId);

    // Take a fee from the _withdrawnAmount, if needed.
    // The project's owner will be the beneficiary of the resulting minted tokens from platform project.
    // The platform project's ID is 1.
    uint256 _feeAmount = _fundingCycle.fee == 0 || _projectId == 1
      ? 0
      : _takeFeeFrom(
        _withdrawnAmount,
        _fundingCycle.fee,
        _projectOwner,
        string(bytes.concat('Fee from @', _handle))
      );

    // The leftover amount once the fee has been taken.
    uint256 _leftoverTransferAmount = _withdrawnAmount - _feeAmount;

    // Transfer any remaining balance to the project owner.
    if (_leftoverTransferAmount > 0)
      // Send the funds to the beneficiary.
      Address.sendValue(_beneficiary, _leftoverTransferAmount);

    emit UseAllowance(
      _fundingCycle.id,
      _fundingCycle.configured,
      _projectId,
      _beneficiary,
      _withdrawnAmount,
      _feeAmount,
      _leftoverTransferAmount,
      msg.sender
    );

    return _fundingCycle.id;
  }

  /**
    @notice
    Addresses can redeem their tokens to claim the project's overflowed ETH, or to trigger rules determined by the project's current funding cycle's data source.

    @dev
    Only a token's holder or a designated operator can redeem it.

    @param _holder The account to redeem tokens for.
    @param _projectId The ID of the project to which the tokens being redeemed belong.
    @param _tokenCount The number of tokens to redeem.
    @param _minReturnedWei The minimum amount of Wei expected in return.
    @param _beneficiary The address to send the ETH to. Send the address this contract to burn the count.
    @param _memo A memo to attach to the emitted event.
    @param _delegateMetadata Bytes to send along to the delegate, if one is provided.

    @return claimAmount The amount of ETH that the tokens were redeemed for, in wei.
  */
  function redeemTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _minReturnedWei,
    address payable _beneficiary,
    string memory _memo,
    bytes memory _delegateMetadata
  )
    external
    override
    nonReentrant
    requirePermission(_holder, _projectId, JBOperations.REDEEM)
    returns (uint256 claimAmount)
  {
    // Can't send claimed funds to the zero address.
    require(_beneficiary != address(0), 'ZERO_ADDRESS');
    // Keep a reference to the funding cycles during which the redemption is being made.
    JBFundingCycle memory _fundingCycle;

    // Record the redemption in the data layer.
    (_fundingCycle, claimAmount, _memo) = _recordRedemptionFor(
      _holder,
      _projectId,
      _tokenCount,
      _minReturnedWei,
      _beneficiary,
      _memo,
      _delegateMetadata
    );

    // Send the claimed funds to the beneficiary.
    if (claimAmount > 0) Address.sendValue(_beneficiary, claimAmount);

    emit Redeem(
      _fundingCycle.id,
      _projectId,
      _holder,
      _fundingCycle,
      _beneficiary,
      _tokenCount,
      claimAmount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Allows a project owner to migrate its funds and operations to a new terminal.

    @dev
    Only a project's owner or a designated operator can migrate it.

    @param _projectId The ID of the project being migrated.
    @param _terminal The terminal contract that will gain the project's funds.
  */
  function migrate(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    nonReentrant
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.MIGRATE_TERMINAL)
  {
    require(directory.isTerminalOf(_projectId, address(this)), 'UNAUTHORIZED');

    // Record the balance transfer in the data layer.
    uint256 _balance = _recordMigrationFor(_projectId, _terminal);

    // Move the funds to the new contract if needed.
    if (_balance > 0) _terminal.addToBalanceOf{value: _balance}(_projectId, 'Migration');

    emit TransferBalance(_projectId, _terminal, _balance, msg.sender);
  }

  /**
    @notice
    Receives and allocated funds belonging to the specified project.

    @param _projectId The ID of the project to which the funds received belong.
    @param _memo A memo to include in the emitted event.
  */
  function addToBalanceOf(uint256 _projectId, string memory _memo) external payable override {
    // Amount must be greater than 0.
    require(msg.value > 0, 'NO_OP');

    // Record the added funds in the data later.
    _recordAddedBalanceFor(_projectId, msg.value);

    emit AddToBalance(_projectId, msg.value, _memo, msg.sender);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /** 
    @notice
    Pays out the splits.

    @param _fundingCycle The funding cycle during which the distribution is being made.
    @param _amount The total amount being distributed.
    @param _memo A memo to send along with emitted distribution events.

    @return leftoverAmount If the split module percents dont add up to 100%, the leftover amount is returned.
  */
  function _distributeToPayoutSplitsOf(
    JBFundingCycle memory _fundingCycle,
    uint256 _amount,
    string memory _memo
  ) private returns (uint256 leftoverAmount) {
    // Set the leftover amount to the initial amount.
    leftoverAmount = _amount;

    // Get a reference to the project's payout splits.
    JBSplit[] memory _splits = splitsStore.splitsOf(
      _fundingCycle.projectId,
      _fundingCycle.configured,
      JBSplitsGroups.ETH_PAYOUT
    );

    // If there are no splits, return the full leftover amount.
    if (_splits.length == 0) return leftoverAmount;

    //Transfer between all splits.
    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // Get a reference to the mod being iterated on.
      JBSplit memory _split = _splits[_i];

      // The amount to send towards mods. Mods percents are out of 10000.
      uint256 _payoutAmount = PRBMath.mulDiv(_amount, _split.percent, 10000);

      if (_payoutAmount > 0) {
        // Transfer ETH to the mod.
        // If there's an allocator set, transfer to its `allocate` function.
        if (_split.allocator != IJBSplitAllocator(address(0))) {
          _split.allocator.allocate{value: _payoutAmount}(
            _payoutAmount,
            1,
            _fundingCycle.projectId,
            _split.projectId,
            _split.beneficiary,
            _split.preferUnstaked
          );
        } else if (_split.projectId != 0) {
          // Otherwise, if a project is specified, make a payment to it.

          // Get a reference to the Juicebox terminal being used.
          IJBTerminal _terminal = directory.terminalOf(_split.projectId, domain);

          // The project must have a terminal to send funds to.
          require(_terminal != IJBTerminal(address(0)), 'BAD_SPLIT');

          // Save gas if this contract is being used as the terminal.
          if (_terminal == this) {
            _pay(
              _payoutAmount,
              _split.projectId,
              _split.beneficiary,
              0,
              _split.preferUnstaked,
              _memo,
              bytes('')
            );
          } else {
            _terminal.pay{value: _payoutAmount}(
              _split.projectId,
              _split.beneficiary,
              0,
              _split.preferUnstaked,
              _memo,
              bytes('')
            );
          }
        } else {
          // Otherwise, send the funds directly to the beneficiary.
          Address.sendValue(_split.beneficiary, _payoutAmount);
        }

        // Subtract from the amount to be sent to the beneficiary.
        leftoverAmount = leftoverAmount - _payoutAmount;
      }

      emit DistributeToPayoutSplit(
        _fundingCycle.id,
        _fundingCycle.projectId,
        _split,
        _payoutAmount,
        msg.sender
      );
    }
  }

  /** 
    @notice 
    Takes a fee into the platform's project, which has an id of 1.

    @param _amount The amount to take a fee from.
    @param _percent The percent fee to take. Out of 200.
    @param _beneficiary The address to print the platforms tokens for.
    @param _memo A memo to send with the fee.

    @return feeAmount The amount of the fee taken.
  */
  function _takeFeeFrom(
    uint256 _amount,
    uint256 _percent,
    address _beneficiary,
    string memory _memo
  ) private returns (uint256 feeAmount) {
    // The amount of ETH from the _tappedAmount to pay as a fee.
    feeAmount = _amount - PRBMath.mulDiv(_amount, 200, _percent + 200);

    // Nothing to do if there's no fee to take.
    if (feeAmount == 0) return 0;

    // Get the terminal for the JuiceboxDAO project.
    IJBTerminal _terminal = directory.terminalOf(1, domain);

    // When processing the admin fee, save gas if the admin is using this contract as its terminal.
    _terminal == this // Use the local pay call.
      ? _pay(feeAmount, 1, _beneficiary, 0, false, _memo, bytes('')) // Use the external pay call of the correct terminal.
      : _terminal.pay{value: feeAmount}(1, _beneficiary, 0, false, _memo, bytes(''));
  }

  /**
    @notice
    See the documentation for 'pay'.
  */
  function _pay(
    uint256 _amount,
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferUnstakedTokens,
    string memory _memo,
    bytes memory _delegateMetadata
  ) private returns (uint256) {
    // Positive payments only.
    require(_amount > 0, 'BAD_AMOUNT');

    // Cant send tokens to the zero address.
    require(_beneficiary != address(0), 'ZERO_ADDRESS');

    JBFundingCycle memory _fundingCycle;
    uint256 _weight;
    uint256 _tokenCount;

    // Record the payment in the data layer.
    (_fundingCycle, _weight, _tokenCount, _memo) = _recordPaymentFrom(
      msg.sender,
      _amount,
      _projectId,
      (_preferUnstakedTokens ? 1 : 0) | uint160(_beneficiary),
      _minReturnedTokens,
      _memo,
      _delegateMetadata
    );

    emit Pay(
      _fundingCycle.id,
      _projectId,
      _beneficiary,
      _fundingCycle,
      _amount,
      _weight,
      _tokenCount,
      _memo,
      msg.sender
    );

    return _fundingCycle.id;
  }

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
    @param _preferUnstakedTokensAndBeneficiary Two properties are included in this packed uint256:
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
  function _recordPaymentFrom(
    address _payer,
    uint256 _amount,
    uint256 _projectId,
    uint256 _preferUnstakedTokensAndBeneficiary,
    uint256 _minReturnedTokens,
    string memory _memo,
    bytes memory _delegateMetadata
  )
    private
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
          address(uint160(_preferUnstakedTokensAndBeneficiary >> 1)),
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
      jb.mintTokensOf(
        _projectId,
        tokenCount,
        address(uint160(_preferUnstakedTokensAndBeneficiary >> 1)),
        'ETH received',
        (_preferUnstakedTokensAndBeneficiary & 1) == 0,
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
        payable(address(uint160(_preferUnstakedTokensAndBeneficiary >> 1))),
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
  function _recordWithdrawalFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei
  ) private returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount) {
    // Registers the funds as withdrawn and gets the ID of the funding cycle during which this withdrawal is being made.
    fundingCycle = jb.withdrawFrom(_projectId, _amount);

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
  function _recordUsedAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei
  ) private returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount) {
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
        jb.overflowAllowanceOf(_projectId, fundingCycle.configured, this) -
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
  function _recordRedemptionFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _minReturnedWei,
    address payable _beneficiary,
    string memory _memo,
    bytes memory _delegateMetadata
  )
    private
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
    if (_tokenCount > 0) jb.burnTokensOf(_holder, _projectId, _tokenCount, 'Redeem for ETH', true);

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
    Allows a project owner to transfer its balance and treasury operations to a new contract.

    @param _projectId The ID of the project that is being migrated.
    @param _terminal The terminal that the project is migrating to.
  */
  function _recordMigrationFor(uint256 _projectId, IJBTerminal _terminal)
    private
    returns (uint256 balance)
  {
    // Get a reference to the project's currently recorded balance.
    balance = balanceOf[_projectId];

    // Set the balance to 0.
    balanceOf[_projectId] = 0;

    // Tell the controller to swap the terminals.
    jb.swapTerminal(_projectId, _terminal);
  }

  /**
    @notice
    Records newly added funds for the project made at the payment layer.

    @dev
    Only the payment layer can record added balance.

    @param _projectId The ID of the project to which the funds being added belong.
    @param _amount The amount added, in wei.
  */
  function _recordAddedBalanceFor(uint256 _projectId, uint256 _amount) private {
    // Set the balance.
    balanceOf[_projectId] = balanceOf[_projectId] + _amount;
  }

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
    uint256 _reservedTokenAmount = jb.reservedTokenBalanceOf(
      _fundingCycle.projectId,
      _fundingCycle.reservedRate()
    );

    // If there are reserved tokens, add them to the total supply.
    if (_reservedTokenAmount > 0) _totalSupply = _totalSupply + _reservedTokenAmount;

    // If the amount being redeemed is the the total supply, return the rest of the overflow.
    if (_tokenCount == _totalSupply) return _currentOverflow;

    // Get a reference to the linear proportion.
    uint256 _base = PRBMath.mulDiv(_currentOverflow, _tokenCount, _totalSupply);

    // Use the ballot redemption rate if the queued cycle is pending approval according to the previous funding cycle's ballot.
    uint256 _redemptionRate = fundingCycleStore.currentBallotStateOf(_fundingCycle.projectId) ==
      BallotState.Active
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
