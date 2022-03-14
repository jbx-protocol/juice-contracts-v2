// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import './../interfaces/IJBDirectory.sol';
import './../libraries/JBTokens.sol';

// --------------------------- custom errors -------------------------- //
//*********************************************************************//
error INSUFFICIENT_BALANCE();
error TERMINAL_NOT_FOUND();
error DEFAULT_PROJECT_NOT_FOUND();

/** 
  @notice A contract that sends funds to a Juicebox project.
*/
abstract contract JBProjectPayer is Ownable {
  event SetDefaultProjectId(uint256 projectId, address caller);

  /**
    @notice 
    A contract storing directories of terminals and controllers for each project.
  */
  IJBDirectory public immutable directory;

  /** 
    @notice 
    The ID of the project that should be used to forward this contract's received payments.
  */
  uint256 public defaultProjectId;

  /** 
    @param _defaultProjectId The ID of the project that should be used to forward this contract's received payments.
    @param _directory A contract storing directories of terminals and controllers for each project.
  */
  constructor(uint256 _defaultProjectId, IJBDirectory _directory) {
    directory = _directory;
    defaultProjectId = _defaultProjectId;
  }

  /** 
    Received funds go straight to the project.
  */
  receive() external payable {
    if (defaultProjectId == 0) revert DEFAULT_PROJECT_NOT_FOUND();
    _pay(defaultProjectId, msg.value, msg.sender, '', false, JBTokens.ETH, bytes(''));
  }

  /** 
    @notice Allows the project that is being managed to be set.
    @param _projectId The ID of the project that is being managed.
  */
  function setDefaultProjectId(uint256 _projectId) external onlyOwner {
    defaultProjectId = _projectId;
    emit SetDefaultProjectId(_projectId, msg.sender);
  }

  /** 
    @notice 
    Make a payment to this project.

    @param _projectId The ID of the project that is being paid.
    @param _beneficiary The address who will receive tickets from this fee.
    @param _memo A memo that will be included in the published event.
    @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    @param _token The token to pay in.
    @param _metadata Bytes to send along with payments to the funding cycle's pay delegate.
  */
  function pay(
    uint256 _projectId,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token,
    bytes memory _metadata
  ) external payable {
    _pay(_projectId, msg.value, _beneficiary, _memo, _preferClaimedTokens, _token, _metadata);
  }

  /** 
    @notice 
    Pay a project.

    @param _projectId The ID of the project being funded.
    @param _amount The payment amount.
    @param _beneficiary The address who will receive tickets from this fee.
    @param _memo A memo that will be included in the published event.
    @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    @param _token The token to pay in.
    @param _metadata Bytes to send along with payments to the funding cycle's data source and pay delegate.
  */
  function _pay(
    uint256 _projectId,
    uint256 _amount,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token,
    bytes memory _metadata
  ) internal {
    // Find the terminal for this contract's project.
    IJBPaymentTerminal _terminal = directory.primaryTerminalOf(_projectId, _token);

    // There must be a terminal.
    if (_terminal == IJBPaymentTerminal(address(0))) revert TERMINAL_NOT_FOUND();

    // There must be enough funds in the contract to fund the treasury.
    if (address(this).balance < _amount) revert INSUFFICIENT_BALANCE();

    uint256 _payableValue = (_token == JBTokens.ETH) ? _amount : 0;

    // Send funds to the terminal.
    _terminal.pay{value: _payableValue}(
      _amount, // ignored if the token is JBTokens.ETH.
      _projectId,
      _beneficiary,
      0,
      _preferClaimedTokens,
      _memo,
      _metadata
    );
  }
}
