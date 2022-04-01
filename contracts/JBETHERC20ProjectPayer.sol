// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import './interfaces/IJBProjectPayer.sol';
import './libraries/JBTokens.sol';

//*********************************************************************//
// -------------------------- custom errors -------------------------- //
//*********************************************************************//
error INSUFFICIENT_BALANCE();
error TERMINAL_NOT_FOUND();
error NO_MSG_VALUE_ALLOWED();
error INCORRECT_DECIMAL_AMOUNT();

/** 
  @notice 
  Sends ETH or ERC20's to a project treasury as it receives direct payments or has it's functions called.

  @dev
  Inherit from this contract or borrow from its logic to forward ETH or ERC20's to project treasuries from within other contracts.

  @dev
  Inherits from:
  IJBETHERC20ProjectPayerDeployer:  General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
*/
contract JBETHERC20ProjectPayer is IJBProjectPayer, Ownable {
  /**
    @notice 
    A contract storing directories of terminals and controllers for each project.
  */
  IJBDirectory public immutable override directory;

  /** 
    @notice 
    The ID of the project that should be used to forward this contract's received payments.
  */
  uint256 public override defaultProjectId;

  /** 
    @notice 
    The beneficiary that should be used in the payment made when this contract receives payments.
  */
  address payable public override defaultBeneficiary;

  /** 
    @notice 
    A flag indicating whether issued tokens should be automatically claimed into the beneficiary's wallet. Leaving tokens unclaimed saves gas.
  */
  bool public override defaultPreferClaimedTokens;

  /** 
    @notice 
    The memo that should be used in the payment made when this contract receives payments.
  */
  string public override defaultMemo;

  /** 
    @notice 
    The metadata that should be used in the payment made when this contract receives payments.
  */
  bytes public override defaultMetadata;

  /** 
    @param _defaultProjectId The ID of the project whose treasury should be forwarded this contract's received payments.
    @param _defaultBeneficiary The address that'll receive the project's tokens. 
    @param _defaultPreferClaimedTokens A flag indicating whether issued tokens should be automatically claimed into the beneficiary's wallet. 
    @param _defaultMemo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.  A data source can alter the memo before emitting in the event and forwarding to the delegate.
    @param _defaultMetadata Bytes to send along to the project's data source and delegate, if provided.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _owner The address that will own the contract.
  */
  constructor(
    uint256 _defaultProjectId,
    address payable _defaultBeneficiary,
    bool _defaultPreferClaimedTokens,
    string memory _defaultMemo,
    bytes memory _defaultMetadata,
    IJBDirectory _directory,
    address _owner
  ) {
    directory = _directory;
    defaultProjectId = _defaultProjectId;
    defaultBeneficiary = _defaultBeneficiary;
    defaultPreferClaimedTokens = _defaultPreferClaimedTokens;
    defaultMemo = _defaultMemo;
    defaultMetadata = _defaultMetadata;

    _transferOwnership(_owner);
  }

  /** 
    Received funds go straight to the project.
  */
  receive() external payable virtual override {
    _pay(
      defaultProjectId,
      JBTokens.ETH,
      address(this).balance,
      18, // balance is a fixed point number with 18 decimals.
      defaultBeneficiary == address(0) ? msg.sender : defaultBeneficiary,
      0, // Can't determine expectation of returned tokens ahead of time.
      defaultPreferClaimedTokens,
      defaultMemo,
      defaultMetadata
    );
  }

  /** 
    @notice 
    Sets the default values that determine how to interact with a protocol treasury when this contract receives ETH directly.

    @param _projectId The ID of the project to forward funds to.
    @param _beneficiary The address that'll receive the project's tokens. 
    @param _preferClaimedTokens A flag indicating whether issued tokens should be automatically claimed into the beneficiary's wallet. 
    @param _memo The memo that'll be used. 
    @param _metadata The metadata that'll be sent. 
  */
  function setDefaultValues(
    uint256 _projectId,
    address payable _beneficiary,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) external override onlyOwner {
    // Set the default project ID if it has changed.
    if (_projectId != defaultProjectId) defaultProjectId = _projectId;

    // Set the default beneficiary if it has changed.
    if (_beneficiary != defaultBeneficiary) defaultBeneficiary = _beneficiary;

    // Set the default claimed token preference if it has changed.
    if (_preferClaimedTokens != defaultPreferClaimedTokens)
      defaultPreferClaimedTokens = _preferClaimedTokens;

    // Set the default memo if it has changed.
    if (keccak256(abi.encodePacked(_memo)) != keccak256(abi.encodePacked(defaultMemo)))
      defaultMemo = _memo;

    // Set the default metadata if it has changed.
    if (keccak256(abi.encodePacked(_metadata)) != keccak256(abi.encodePacked(defaultMetadata)))
      defaultMetadata = _metadata;

    emit SetDefaultValues(
      _projectId,
      _beneficiary,
      _preferClaimedTokens,
      _memo,
      _metadata,
      msg.sender
    );
  }

  /** 
    @notice 
    Make a payment to the specified project.

    @param _projectId The ID of the project that is being paid.
    @param _token The token being paid in.
    @param _amount The amount of tokens being paid, as a fixed point number. If this terminal's token is ETH, this is ignored and msg.value is used in its place.
    @param _decimals The number of decimals in the `_amount` fixed point number. If this terminal's token is ETH, this is ignored and 18 is used in its place, which corresponds to the amount of decimals expected in msg.value.
    @param _beneficiary The address who will receive tokens form the payment.
    @param _minReturnedTokens The minimum number of project tokens expected in return, as a fixed point number with 18 decimals.
    @param _preferClaimedTokens A flag indicating whether the request prefers to mint project tokens into the beneficiaries wallet rather than leaving them unclaimed. This is only possible if the project has an attached token contract. Leaving them unclaimed saves gas.
    @param _memo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.  A data source can alter the memo before emitting in the event and forwarding to the delegate.
    @param _metadata Bytes to send along to the data source and delegate, if provided.
  */
  function pay(
    uint256 _projectId,
    address _token,
    uint256 _amount,
    uint256 _decimals,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string calldata _memo,
    bytes calldata _metadata
  ) public payable virtual override {
    // ETH shouldn't be sent if this terminal's token isn't ETH.
    if (address(_token) != JBTokens.ETH) {
      if (msg.value > 0) revert NO_MSG_VALUE_ALLOWED();

      // Transfer tokens to this terminal from the msg sender.
      IERC20(_token).transferFrom(msg.sender, payable(address(this)), _amount);
    } else {
      _amount = msg.value;
      _decimals = 18;
    }

    _pay(
      _projectId,
      _token,
      _amount,
      _decimals,
      _beneficiary,
      _minReturnedTokens,
      _preferClaimedTokens,
      _memo,
      _metadata
    );
  }

  /** 
    @notice 
    Make a payment to the specified project.

    @param _projectId The ID of the project that is being paid.
    @param _token The token being paid in.
    @param _amount The amount of tokens being paid, as a fixed point number. If this terminal's token is ETH, this is ignored and msg.value is used in its place.
    @param _decimals The number of decimals in the `_amount` fixed point number. If this terminal's token is ETH, this is ignored and 18 is used in its place, which corresponds to the amount of decimals expected in msg.value.
    @param _beneficiary The address who will receive tokens form the payment.
    @param _minReturnedTokens The minimum number of project tokens expected in return, as a fixed point number with 18 decimals.
    @param _preferClaimedTokens A flag indicating whether the request prefers to mint project tokens into the beneficiaries wallet rather than leaving them unclaimed. This is only possible if the project has an attached token contract. Leaving them unclaimed saves gas.
    @param _memo A memo to pass along to the emitted event, and passed along the the funding cycle's data source and delegate.  A data source can alter the memo before emitting in the event and forwarding to the delegate.
    @param _metadata Bytes to send along to the data source and delegate, if provided.
  */
  function _pay(
    uint256 _projectId,
    address _token,
    uint256 _amount,
    uint256 _decimals,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) internal virtual {
    // Find the terminal for this contract's project.
    IJBPaymentTerminal _terminal = directory.primaryTerminalOf(_projectId, _token);

    // There must be a terminal.
    if (_terminal == IJBPaymentTerminal(address(0))) revert TERMINAL_NOT_FOUND();

    // The amount's decimals must match the terminal's expected decimals.
    if (_terminal.decimals() != _decimals) revert INCORRECT_DECIMAL_AMOUNT();

    // Approve the `_amount` of tokens from this terminal to transfer tokens from this terminal.
    if (_token != JBTokens.ETH) IERC20(_token).approve(address(_terminal), _amount);

    // If this terminal's token is ETH, send it in msg.value.
    uint256 _payableValue = _token == JBTokens.ETH ? _amount : 0;

    // Pay if there's a beneficiary to receive tokens.
    if (_beneficiary != address(0))
      // Send funds to the terminal.
      _terminal.pay{value: _payableValue}(
        _amount, // ignored if the token is JBTokens.ETH.
        _projectId,
        _beneficiary,
        _minReturnedTokens,
        _preferClaimedTokens,
        _memo,
        _metadata
      );
      // Otherwise just add to balance so tokens don't get issued.
    else _terminal.addToBalanceOf{value: _payableValue}(_projectId, _amount, _memo);
  }
}
