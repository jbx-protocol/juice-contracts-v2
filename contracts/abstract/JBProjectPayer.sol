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

/** 
  @notice A contract that sends funds to a Juicebox project.
*/
abstract contract JBProjectPayer is Ownable {
  /// @notice The direct deposit terminals.
  IJBDirectory public immutable directory;

  /// @notice The ID of the project that should be used to forward this contract's received payments.
  uint256 public defaultProjectId;

  /** 
    @param _defaultProjectId The ID of the project that should be used to forward this contract's received payments.
    @param _directory The direct deposit terminals.
  */
  constructor(uint256 _defaultProjectId, IJBDirectory _directory) {
    directory = _directory;
    defaultProjectId = _defaultProjectId;
  }

  /** 
    Received funds go straight to the project.
  */
  receive() external payable {
    if (defaultProjectId > 0)
      _pay(defaultProjectId, msg.value, msg.sender, '', false, JBTokens.ETH, bytes(''));
  }

  /** 
    @notice Allows the project that is being managed to be set.
    @param _projectId The ID of the project that is being managed.
  */
  function setDefaultProjectId(uint256 _projectId) external onlyOwner {
    defaultProjectId = _projectId;
  }

  /** 
    @notice Make a payment to this project.
    @param _projectId The ID of the project that is being paid.
    @param _beneficiary The address who will receive tickets from this fee.
    @param _memo A memo that will be included in the published event.
    @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    @param _token The token to pay in.
    @param _delegateMetadata Bytes to send along with payments to the funding cycle's pay delegate.
  */
  function pay(
    uint256 _projectId,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token,
    bytes memory _delegateMetadata
  ) external payable {
    _pay(
      _projectId,
      msg.value,
      _beneficiary,
      _memo,
      _preferClaimedTokens,
      _token,
      _delegateMetadata
    );
  }

  /** 
    @notice Pay a project.

    @param _projectId The ID of the project being funded.
    @param _amount The payment amount.
    @param _beneficiary The address who will receive tickets from this fee.
    @param _memo A memo that will be included in the published event.
    @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    @param _delegateMetadata Bytes to send along with payments to the funding cycle's pay delegate.
  */
  function _pay(
    uint256 _projectId,
    uint256 _amount,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token,
    bytes memory _delegateMetadata
  ) internal {
    // Find the terminal for this contract's project.
    IJBTerminal _terminal = directory.primaryTerminalOf(_projectId, _token);

    // There must be a terminal.
    if (_terminal == IJBTerminal(address(0))) {
      revert TERMINAL_NOT_FOUND();
    }

    // There must be enough funds in the contract to fund the treasury.
    if (address(this).balance < _amount) {
      revert INSUFFICIENT_BALANCE();
    }

    // Send funds to the terminal.
    _terminal.pay{value: _amount}(
      _projectId,
      _beneficiary,
      0,
      _preferClaimedTokens,
      _memo,
      _delegateMetadata
    );
  }
}
