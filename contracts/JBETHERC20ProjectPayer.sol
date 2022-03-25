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

/** 
  @notice 
  A contract that sends funds to a Juicebox project.
*/
contract JBETHERC20ProjectPayer is IJBProjectPayer, Ownable {
  event SetDefaultValues(
    uint256 projectId,
    address beneficiary,
    bool preferClaimedTokens,
    string memo,
    bytes metadata,
    address caller
  );

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
    @param _defaultProjectId The ID of the project that should be used to forward this contract's received payments.
    @param _defaultBeneficiary The address that'll receive the project's tokens. 
    @param _defaultPreferClaimedTokens A flag indicating whether issued tokens should be automatically claimed into the beneficiary's wallet. 
    @param _defaultMemo The memo that'll be used. 
    @param _defaultMetadata The metadata that'll be sent. 
    @param _directory A contract storing directories of terminals and controllers for each project.
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
      defaultBeneficiary == address(0) ? msg.sender : defaultBeneficiary,
      0, // Can't determine expectation of returned tokens ahead of time.
      defaultPreferClaimedTokens,
      defaultMemo,
      defaultMetadata
    );
  }

  /** 
    @notice 
    Sets the default values that determin how to interact with a protocol treasury when this contract receives ETH directly.

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
    defaultProjectId = _projectId;
    defaultBeneficiary = _beneficiary;
    defaultPreferClaimedTokens = _preferClaimedTokens;
    defaultMemo = _memo;
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
    Make a payment to this project.

    @param _projectId The ID of the project that is being paid.
    @param _token The token to pay in.
    @param _amount The amount of terminal tokens being received, as a fixed point number with the amount of decimals as the `_token`'s termina. If this terminal's token is ETH, this is ignored and msg.value is used in its place.
    @param _beneficiary The address who will receive tickets from this fee.
    @param _minReturnedTokens The minimum number of project tokens expected in return, as a fixed point
    @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    @param _memo A memo that will be included in the published event.
    @param _metadata Bytes to send along with payments to the funding cycle's pay delegate.
  */
  function pay(
    uint256 _projectId,
    address _token,
    uint256 _amount,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) public payable virtual override {
    // ETH shouldn't be sent if this terminal's token isn't ETH.
    if (address(_token) != JBTokens.ETH) {
      if (msg.value > 0) revert NO_MSG_VALUE_ALLOWED();

      // Transfer tokens to this terminal from the msg sender.
      IERC20(_token).transferFrom(msg.sender, payable(address(this)), _amount);
    } else _amount = msg.value;

    _pay(
      _projectId,
      _token,
      _amount,
      _beneficiary,
      _minReturnedTokens,
      _preferClaimedTokens,
      _memo,
      _metadata
    );
  }

  /** 
    @notice 
    Pay a project.

    @param _projectId The ID of the project being funded.
    @param _token The token to pay in.
    @param _amount The payment amount.
    @param _beneficiary The address who will receive tickets from this fee.
    @param _minReturnedTokens The minimum number of project tokens expected in return, as a fixed point
    @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    @param _memo A memo that will be included in the published event.
    @param _metadata Bytes to send along with payments to the funding cycle's data source and pay delegate.
  */
  function _pay(
    uint256 _projectId,
    address _token,
    uint256 _amount,
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

    // Approve the `_amount` of tokens from this terminal to transfer tokens from this terminal.
    if (_token != JBTokens.ETH) IERC20(_token).approve(address(_terminal), _amount);

    // If this terminal's token is ETH, send it in msg.value.
    uint256 _payableValue = _token == JBTokens.ETH ? _amount : 0;

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
  }
}
