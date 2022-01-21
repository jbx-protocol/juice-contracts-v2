// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
import '@paulrberg/contracts/math/PRBMath.sol';

import './libraries/JBConstants.sol';
import './libraries/JBCurrencies.sol';
import './libraries/JBOperations.sol';
import './libraries/JBSplitsGroups.sol';
import './libraries/JBTokens.sol';

import './JBETHPaymentTerminalStore.sol';

// Inheritance
import './interfaces/IJBETHPaymentTerminal.sol';
import './interfaces/IJBTerminal.sol';
import './abstract/JBOperatable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error FEE_TOO_HIGH();
error PAY_TO_ZERO_ADDRESS();
error REDEEM_TO_ZERO_ADDRESS();
error TERMINAL_IN_SPLIT_ZERO_ADDRESS();
error TERMINAL_TOKENS_INCOMPATIBLE();
error ZERO_VALUE_SENT();

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
    Maximum fee that can be set for a funding cycle configuration.
  */
  uint256 private constant _MAX_FEE = 10;

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
    The contract that stores and manages the terminal's data.
  */
  JBETHPaymentTerminalStore public immutable store;

  /** 
    @notice 
    The token that this terminal accepts. 
  */
  address public immutable override token = JBTokens.ETH;

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
    The ETH balance that this terminal holds for each project.

    @param _projectId The ID of the project to which the balance belongs.

    @return The ETH balance.
  */
  function ethBalanceOf(uint256 _projectId) external view override returns (uint256) {
    // The store's balance is already in ETH.
    return store.balanceOf(_projectId);
  }

  /**
    @notice
    The amount of funds that can still be distributed within the preconfigured limit.

    @param _projectId The ID of the project to which the remaining limit belongs.
    @param _fundingCycleConfiguration The funding cycle configuration during which the limit remaining is being calculated.
    @param _fundingCycleNumber The number of the funding cycle during which the limit remaining is being calculated.

    @return The remaining distribution limit for this terminal.
  */
  function remainingDistributionLimitOf(
    uint256 _projectId,
    uint256 _fundingCycleConfiguration,
    uint256 _fundingCycleNumber
  ) external view override returns (uint256) {
    // Subtract the used distribution limit during the specified funding cycle from the preconfigured distribution limit.
    return
      directory.controllerOf(_projectId).distributionLimitOf(
        _projectId,
        _fundingCycleConfiguration,
        this
      ) - store.usedDistributionLimitOf(_projectId, _fundingCycleNumber);
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

  /**
    @notice
    An address that serves as this terminal's delegate when making requests to juicebox ecosystem contracts.

    @return The delegate address.
  */
  function delegate() external view override returns (address) {
    // The store is the delegate.
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
    @param _store A contract that stores the terminal's data.
    @param _owner The address that will own this contract.
  */
  constructor(
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    JBETHPaymentTerminalStore _store,
    address _owner
  ) JBOperatable(_operatorStore) {
    projects = _projects;
    directory = _directory;
    splitsStore = _splitsStore;

    // Claim the store so that it recognizes this terminal as the one that can access it.
    _store.claimFor(this);

    store = _store;

    transferOwnership(_owner);
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Contribute ETH to a project.

    @dev
    The msg.value is the amount of the contribution in wei.

    @param _projectId The ID of the project being paid.
    @param _beneficiary The address to mint tokens for and pass along to the funding cycle's data source and delegate.
    @param _minReturnedTokens The minimum number of tokens expected in return.
    @param _preferClaimedTokens A flag indicating whether the request prefers to issue tokens unstaked rather than staked.
    @param _memo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.
    @param _delegateMetadata Bytes to send along to the delegate, if one is provided.
  */
  function pay(
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string calldata _memo,
    bytes calldata _delegateMetadata
  ) external payable override {
    return
      _pay(
        msg.value,
        _projectId,
        _beneficiary,
        _minReturnedTokens,
        _preferClaimedTokens,
        _memo,
        _delegateMetadata
      );
  }

  /**
    @notice
    Distributes payouts for a project according to the constraints of its current funding cycle.

    @dev
    Payouts are sent to the preprogrammed splits.

    @dev
    Anyone can distribute payouts on a project's behalf.

    @param _projectId The ID of the project having its payouts distributed.
    @param _amount The amount being distributed.
    @param _currency The expected currency of the amount being distributed. Must match the project's current funding cycle's currency.
    @param _minReturnedWei The minimum number of wei that the amount should be valued at.
  */
  function distributePayoutsOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei,
    string memory _memo
  ) external override nonReentrant {
    // Record the distribution.
    (JBFundingCycle memory _fundingCycle, uint256 _distributedAmount) = store.recordDistributionFor(
      _projectId,
      _amount,
      _currency,
      _minReturnedWei
    );

    // Get a reference to the project owner, which will receive tokens from paying the platform fee
    // and receive any extra distributable funds not allocated to payout splits.
    address payable _projectOwner = payable(projects.ownerOf(_projectId));

    // Take a fee from the _distributedAmount, if needed.
    // The project's owner will be the beneficiary of the resulting minted tokens from platform project.
    // The platform project's ID is 1.
    uint256 _feeAmount = fee == 0 || _projectId == 1
      ? 0
      : _takeFeeFrom(
        _projectId,
        _fundingCycle,
        _distributedAmount,
        _projectOwner,
        string(bytes.concat('Fee from ', bytes32(_projectId)))
      );

    // Payout to splits and get a reference to the leftover transfer amount after all mods have been paid.
    // The net transfer amount is the withdrawn amount minus the fee.
    uint256 _leftoverDistributionAmount = _distributeToPayoutSplitsOf(
      _projectId,
      _fundingCycle,
      _distributedAmount - _feeAmount,
      string(bytes.concat('Payout from ', bytes32(_projectId)))
    );

    // Transfer any remaining balance to the project owner.
    if (_leftoverDistributionAmount > 0)
      Address.sendValue(_projectOwner, _leftoverDistributionAmount);

    emit DistributePayouts(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _projectOwner,
      _amount,
      _distributedAmount,
      _feeAmount,
      _leftoverDistributionAmount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Allows a project to send funds from its overflow up to the preconfigured allowance.

    @dev
    Only a project's owner or a designated operator can migrate it.

    @param _projectId The ID of the project to use the allowance of.
    @param _amount The amount of the allowance to use.
    @param _beneficiary The address to send the funds to.
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
  {
    // Record the use of the allowance.
    (JBFundingCycle memory _fundingCycle, uint256 _withdrawnAmount) = store.recordUsedAllowanceOf(
      _projectId,
      _amount,
      _currency,
      _minReturnedWei
    );

    // Get a reference to the project owner, which will receive tokens from paying the platform fee
    // and receive any extra distributable funds not allocated to payout splits.
    address payable _projectOwner = payable(projects.ownerOf(_projectId));

    // Take a fee from the _withdrawnAmount, if needed.
    // The project's owner will be the beneficiary of the resulting minted tokens from platform project.
    // The platform project's ID is 1.

    // Prevents stack-too-deep error
    string memory str = string(bytes.concat('Fee from ', bytes32(_projectId)));
    uint256 _feeAmount = fee == 0 || _projectId == 1
      ? 0
      : _takeFeeFrom(_projectId, _fundingCycle, _withdrawnAmount, _projectOwner, str);

    // Transfer any remaining balance to the project owner.
    Address.sendValue(_beneficiary, _withdrawnAmount - _feeAmount);

    emit UseAllowance(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _beneficiary,
      _withdrawnAmount,
      _feeAmount,
      _withdrawnAmount - _feeAmount,
      msg.sender
    );
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
    @param _memo A memo to pass along to the emitted event.
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
    if (_beneficiary == address(0)) {
      revert REDEEM_TO_ZERO_ADDRESS();
    }

    // Keep a reference to the funding cycles during which the redemption is being made.
    JBFundingCycle memory _fundingCycle;

    // Record the redemption.
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
    if (claimAmount > 0) Address.sendValue(_beneficiary, claimAmount);

    emit RedeemTokens(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _holder,
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
    // The terminal being migrated to must accept the same token as this terminal.
    if (token != _to.token()) {
      revert TERMINAL_TOKENS_INCOMPATIBLE();
    }

    // Record the migration in the store.
    uint256 _balance = store.recordMigration(_projectId);

    if (_balance > 0)
      // Withdraw the balance to transfer to the new terminal;
      _to.addToBalanceOf{value: _balance}(_projectId, '');

    emit Migrate(_projectId, _to, _balance, msg.sender);
  }

  /**
    @notice
    Receives funds belonging to the specified project.

    @param _projectId The ID of the project to which the funds received belong.
    @param _memo A memo to pass along to the emitted event.
  */
  function addToBalanceOf(uint256 _projectId, string memory _memo) external payable override {
    // Amount must be greater than 0.
    if (msg.value == 0) {
      revert ZERO_VALUE_SENT();
    }

    // Record the added funds.
    store.recordAddedBalanceFor(_projectId, msg.value);

    // Refund any held fees to make sure the project doesn't pay double for funds going in and out of the protocol.
    _refundHeldFees(_projectId, msg.value);

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
    nonReentrant
  {
    // Get a reference to the project's held fees.
    JBFee[] memory _heldFees = _heldFeesOf[_projectId];

    // Process each fee.
    for (uint256 _i = 0; _i < _heldFees.length; _i++)
      _takeFee(
        _heldFees[_i].amount - PRBMath.mulDiv(_heldFees[_i].amount, 200, _heldFees[_i].fee + 200),
        _heldFees[_i].beneficiary,
        _heldFees[_i].memo
      );

    // Delete the held fee's now that they've been processed.
    delete _heldFeesOf[_projectId];

    emit ProcessFees(_projectId, _heldFees, msg.sender);
  }

  /**
    @notice
    Allows the fee to be updated for subsequent funding cycle configurations.

    @dev
    Only the owner of this contract can change the fee.

    @param _fee The new fee.
  */
  function setFee(uint256 _fee) external onlyOwner {
    // The max fee is 5%.
    if (_fee > _MAX_FEE) {
      revert FEE_TOO_HIGH();
    }

    // Store the new fee.
    fee = _fee;

    emit SetFee(_fee, msg.sender);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice
    Pays out splits for a project's funding cycle configuration.

    @param _projectId The ID of the project for which payout splits are being distributed.
    @param _fundingCycle The funding cycle during which the distribution is being made.
    @param _amount The total amount being distributed.
    @param _memo A memo to pass along to the emitted events.

    @return leftoverAmount If the leftover amount if the splits don't add up to 100%.
  */
  function _distributeToPayoutSplitsOf(
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _amount,
    string memory _memo
  ) private returns (uint256 leftoverAmount) {
    // Set the leftover amount to the initial amount.
    leftoverAmount = _amount;

    // Get a reference to the project's payout splits.
    JBSplit[] memory _splits = splitsStore.splitsOf(
      _projectId,
      _fundingCycle.configuration,
      JBSplitsGroups.ETH_PAYOUT
    );

    //Transfer between all splits.
    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // Get a reference to the mod being iterated on.
      JBSplit memory _split = _splits[_i];

      // The amount to send towards mods.
      uint256 _payoutAmount = PRBMath.mulDiv(
        _amount,
        _split.percent,
        JBConstants.SPLITS_TOTAL_PERCENT
      );

      if (_payoutAmount > 0) {
        // Transfer ETH to the mod.
        // If there's an allocator set, transfer to its `allocate` function.
        if (_split.allocator != IJBSplitAllocator(address(0))) {
          _split.allocator.allocate{value: _payoutAmount}(
            _payoutAmount,
            JBSplitsGroups.ETH_PAYOUT,
            _projectId,
            _split.projectId,
            _split.beneficiary,
            _split.preferClaimed
          );
          // Otherwise, if a project is specified, make a payment to it.
        } else if (_split.projectId != 0) {
          // Get a reference to the Juicebox terminal being used.
          IJBTerminal _terminal = directory.primaryTerminalOf(_split.projectId, token);

          // The project must have a terminal to send funds to.
          if (_terminal == IJBTerminal(address(0))) {
            revert TERMINAL_IN_SPLIT_ZERO_ADDRESS();
          }

          // Save gas if this contract is being used as the terminal.
          if (_terminal == this) {
            _pay(
              _payoutAmount,
              _split.projectId,
              _split.beneficiary,
              0,
              _split.preferClaimed,
              _memo,
              bytes('')
            );
          } else {
            _terminal.pay{value: _payoutAmount}(
              _split.projectId,
              _split.beneficiary,
              0,
              _split.preferClaimed,
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
        _fundingCycle.configuration,
        _fundingCycle.number,
        _projectId,
        _split,
        _payoutAmount,
        msg.sender
      );
    }
  }

  /**
    @notice
    Takes a fee into the platform's project, which has an id of 1.

    @param _projectId The ID of the project having fees taken from.
    @param _fundingCycle The funding cycle during which the fee is being taken.
    @param _amount The amount to take a fee from.
    @param _beneficiary The address to print the platforms tokens for.
    @param _memo A memo to pass along to the emitted event.

    @return feeAmount The amount of the fee taken.
  */
  function _takeFeeFrom(
    uint256 _projectId,
    JBFundingCycle memory _fundingCycle,
    uint256 _amount,
    address _beneficiary,
    string memory _memo
  ) private returns (uint256 feeAmount) {
    // The amount of ETH from the _amount to pay as a fee.
    feeAmount = _amount - PRBMath.mulDiv(_amount, 200, fee + 200);

    // Nothing to do if there's no fee to take.
    if (feeAmount == 0) return 0;

    _fundingCycle.shouldHoldFees()
      ? _heldFeesOf[_projectId].push(JBFee(_amount, uint8(fee), _beneficiary, _memo)) // Take the fee.
      : _takeFee(feeAmount, _beneficiary, _memo);
  }

  /**
    @notice
    Take a fee of the specified amount.

    @param _amount The fee amount.
    @param _beneficiary The address to print the platforms tokens for.
    @param _memo A memo to pass along to the emitted event.
  */
  function _takeFee(
    uint256 _amount,
    address _beneficiary,
    string memory _memo
  ) private {
    // Get the terminal for the JuiceboxDAO project.
    IJBTerminal _terminal = directory.primaryTerminalOf(1, token);

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
  ) private {
    // Cant send tokens to the zero address.
    if (_beneficiary == address(0)) {
      revert PAY_TO_ZERO_ADDRESS();
    }

    JBFundingCycle memory _fundingCycle;
    uint256 _weight;
    uint256 _tokenCount;

    // Record the payment.
    (_fundingCycle, _weight, _tokenCount, _memo) = store.recordPaymentFrom(
      msg.sender,
      _amount,
      _projectId,
      (_preferClaimedTokens ? 1 : 0) | (uint160(_beneficiary) << 1),
      _minReturnedTokens,
      _memo,
      _delegateMetadata
    );

    emit Pay(
      _fundingCycle.configuration,
      _fundingCycle.number,
      _projectId,
      _beneficiary,
      _amount,
      _weight,
      _tokenCount,
      _memo,
      msg.sender
    );
  }

  /**
    @notice
    Refund fees based on the specified amount.

    @param _projectId The project for which fees are being refunded.
    @param _amount The amount to base the refund on.
  */
  function _refundHeldFees(uint256 _projectId, uint256 _amount) private {
    // Get a reference to the project's held fees.
    JBFee[] memory _heldFees = _heldFeesOf[_projectId];

    // Delete the current held fees.
    delete _heldFeesOf[_projectId];

    // Process each fee.
    for (uint256 _i = 0; _i < _heldFees.length; _i++) {
      if (_amount == 0) {
        _heldFeesOf[_projectId].push(_heldFees[_i]);
      } else if (_amount >= _heldFees[_i].amount) {
        _amount = _amount - _heldFees[_i].amount;
      } else {
        _heldFeesOf[_projectId].push(
          JBFee(
            _heldFees[_i].amount - _amount,
            _heldFees[_i].fee,
            _heldFees[_i].beneficiary,
            _heldFees[_i].memo
          )
        );
        _amount = 0;
      }
    }
  }
}
