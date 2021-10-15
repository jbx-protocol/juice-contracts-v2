// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
import '@paulrberg/contracts/math/PRBMath.sol';

import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBFundingCycleMetadataResolver.sol';

import './JBETHPaymentTerminalStore.sol';

// Inheritance
import './interfaces/IJBETHPaymentTerminal.sol';
import './interfaces/IJBTerminal.sol';
import './interfaces/IJBVault.sol';
import './abstract/JBOperatable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

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
  // --------------------- private stored constants -------------------- //
  //*********************************************************************//

  /**
    @notice 
    Fees that are being held to be processed later.

    @dev
    [_projectId]

    _projectId The ID of the project whos fees are held.
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
    The contract that stores the ETH.
  */
  IJBVault public immutable override vault;

  /**
    @notice 
    The contract that stores and manages the terminal's data.
  */
  JBETHPaymentTerminalStore public immutable store;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  function heldFeesOf(uint256 _projectId) external view override returns (JBFee[] memory) {
    return _heldFeesOf[_projectId];
  }

  function delegate() external view override returns (address) {
    return address(store);
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _operatorStore A contract storing operator assignments.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _splitsStore A contract that stores splits for each project.
    @param _vault A contract to store funds in.
    @param _store A contract that stores the terminal's data.
  */
  constructor(
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    IJBVault _vault,
    JBETHPaymentTerminalStore _store
  ) JBOperatable(_operatorStore) {
    projects = _projects;
    directory = _directory;
    splitsStore = _splitsStore;
    vault = _vault;
    store = _store;
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
    @param _preferClaimedTokens A flag indicating whether the request prefers to issue tokens unstaked rather than staked.
    @param _memo A memo that will be included in the published event, and passed along the the funding cycle's data source and delegate.
    @param _delegateMetadata Bytes to send along to the delegate, if one is provided.

    @return fundingCycleId The number of the funding cycle that the payment was made during.
  */
  function pay(
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string calldata _memo,
    bytes calldata _delegateMetadata
  ) external payable override returns (uint256 fundingCycleId) {
    fundingCycleId = _pay(
      msg.value,
      _projectId,
      _beneficiary,
      _minReturnedTokens,
      _preferClaimedTokens,
      _memo,
      _delegateMetadata
    );
    // Deposit the funds in the vault.
    vault.deposit{value: msg.value}(_projectId, 0);
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
    (JBFundingCycle memory _fundingCycle, uint256 _withdrawnAmount) = store.recordWithdrawalFor(
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
        _fundingCycle,
        _withdrawnAmount,
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
    if (_leftoverTransferAmount > 0)
      vault.withdraw(_projectId, _leftoverTransferAmount, _projectOwner);

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
    (JBFundingCycle memory _fundingCycle, uint256 _withdrawnAmount) = store.recordUsedAllowanceOf(
      _projectId,
      this,
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
        _fundingCycle,
        _withdrawnAmount,
        _projectOwner,
        string(bytes.concat('Fee from @', _handle))
      );

    // Transfer any remaining balance to the project owner.
    // The leftover amount once the fee has been taken.
    if (_withdrawnAmount - _feeAmount > 0)
      // Send the funds to the beneficiary.
      vault.withdraw(_projectId, _withdrawnAmount - _feeAmount, _beneficiary);

    emit UseAllowance(
      _fundingCycle.id,
      _fundingCycle.configured,
      _projectId,
      _beneficiary,
      _withdrawnAmount,
      _feeAmount,
      _withdrawnAmount - _feeAmount,
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
    (_fundingCycle, claimAmount, _memo) = store.recordRedemptionFor(
      _holder,
      _projectId,
      _tokenCount,
      _minReturnedWei,
      _beneficiary,
      _memo,
      _delegateMetadata
    );

    // Send the claimed funds to the beneficiary.
    if (claimAmount > 0) vault.withdraw(_projectId, claimAmount, _beneficiary);

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
    @param _to The terminal contract that will gain the project's funds.
  */
  function migrate(uint256 _projectId, IJBTerminal _to)
    external
    override
    nonReentrant
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.MIGRATE_TERMINAL)
  {
    require(directory.isTerminalOf(_projectId, this), 'UNAUTHORIZED');

    require(vault.token() == _to.vault().token(), 'TODO');

    // Get a reference to the project's currently recorded balance.
    uint256 _balance = store.balanceOf(_projectId);

    if (_balance > 0)
      // Withdraw the balance to transfer to the new terminal;
      // Must withdraw before recording the migration to have access to the vault.
      vault.withdraw(_projectId, _balance, payable(address(_to.vault())));

    store.recordMigration(_projectId, _to);

    emit Migrate(_projectId, _to, _balance, msg.sender);
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
    store.recordAddedBalanceFor(_projectId, msg.value);

    // Deposit the funds in the vault.
    vault.deposit{value: msg.value}(_projectId, 0);

    emit AddToBalance(_projectId, msg.value, _memo, msg.sender);
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
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.PROCESS_FEES,
      msg.sender == owner()
    )
  {
    // Get a reference to the project's held fees.
    JBFee[] memory _pendingFees = _heldFeesOf[_projectId];

    // Process each fee.
    for (uint256 _i = 0; _i < _pendingFees.length; _i++)
      _takeFee(_pendingFees[_i].amount, _pendingFees[_i].beneficiary, _pendingFees[_i].memo);

    // Delete the held fee's now that they've been processed.
    delete _heldFeesOf[_projectId];

    emit ProcessFees(_projectId, _pendingFees);
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
          // Otherwise, if a project is specified, make a payment to it.
        } else if (_split.projectId != 0) {
          // Get a reference to the Juicebox terminal being used.
          IJBTerminal _terminal = directory.terminalOf(_split.projectId, vault.token());

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
          vault.withdraw(_fundingCycle.projectId, _payoutAmount, _split.beneficiary);
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

    @param _fundingCycle The funding cycle during which the fee is being taken. 
    @param _amount The amount to take a fee from.
    @param _beneficiary The address to print the platforms tokens for.
    @param _memo A memo to send with the fee.

    @return feeAmount The amount of the fee taken.
  */
  function _takeFeeFrom(
    JBFundingCycle memory _fundingCycle,
    uint256 _amount,
    address _beneficiary,
    string memory _memo
  ) private returns (uint256 feeAmount) {
    // The amount of ETH from the _tappedAmount to pay as a fee.
    feeAmount = _amount - PRBMath.mulDiv(_amount, 200, _fundingCycle.fee + 200);

    // Nothing to do if there's no fee to take.
    if (feeAmount == 0) return 0;

    _fundingCycle.shouldHoldFees()
      ? _heldFeesOf[_fundingCycle.projectId].push(JBFee(feeAmount, _beneficiary, _memo)) // Take the fee.
      : _takeFee(feeAmount, _beneficiary, _memo);
  }

  function _takeFee(
    uint256 _amount,
    address _beneficiary,
    string memory _memo
  ) private {
    // Get the terminal for the JuiceboxDAO project.
    IJBTerminal _terminal = directory.terminalOf(1, vault.token());

    // When processing the admin fee, save gas if the admin is using this contract as its terminal.
    _terminal == this // Use the local pay call.
      ? _pay(_amount, 1, _beneficiary, 0, false, _memo, bytes('')) // Use the external pay call of the correct terminal.
      : _terminal.pay{value: _amount}(1, _beneficiary, 0, false, _memo, bytes(''));
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
    bool _preferClaimedTokens,
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
    (_fundingCycle, _weight, _tokenCount, _memo) = store.recordPaymentFrom(
      msg.sender,
      _amount,
      _projectId,
      (_preferClaimedTokens ? 1 : 0) | uint160(_beneficiary),
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
}
