// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import './../interfaces/IJBDirectory.sol';
import './../libraries/JBTokens.sol';

// --------------------------- custom errors -------------------------- //
//*********************************************************************//
error INSUFFICIENT_BALANCE();
error PROJECT_NOT_FOUND();
error TERMINAL_NOT_FOUND();

/** 
  @notice A contract that inherits from JuiceboxProject can use Juicebox as a business-model-as-a-service.
  @dev The owner of the contract makes admin decisions such as:
    - Which address is the funding cycle owner, which can withdraw funds from the funding cycle.
    - Should this project's Tickets be migrated to a new TerminalV1. 
*/
abstract contract JBProject is Ownable {
  /// @notice The direct deposit terminals.
  IJBDirectory public immutable directory;

  /// @notice The ID of the project that should be used to forward this contract's received payments.
  uint256 public projectId;

  /** 
      @param _projectId The ID of the project that should be used to forward this contract's received payments.
      @param _directory A directory of a project's current Juicebox terminal to receive payments in.
    */
  constructor(uint256 _projectId, IJBDirectory _directory) {
    projectId = _projectId;
    directory = _directory;
  }

  /** 
      Received funds go straight to the project.
    */
  receive() external payable {
    _pay(msg.sender, '', false, JBTokens.ETH);
  }

  /** 
      @notice Allows the project that is being managed to be set.
      @param _projectId The ID of the project that is being managed.
    */
  function setProjectId(uint256 _projectId) external onlyOwner {
    projectId = _projectId;
  }

  /** 
      @notice Make a payment to this project.
      @param _beneficiary The address who will receive tickets from this fee.
      @param _memo A memo that will be included in the published event.
      @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    */
  function pay(
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token
  ) external payable {
    _pay(_beneficiary, _memo, _preferClaimedTokens, _token);
  }

  /** 
      @notice Take a fee for this project from this contract.
      @param _projectId The ID of the project being funded.
      @param _amount The payment amount.
      @param _beneficiary The address who will receive tickets from this fee.
      @param _memo A memo that will be included in the published event.
      @param _preferClaimedTokens Whether ERC20's should be claimed automatically if they have been issued.
    */
  function _fundTreasury(
    uint256 _projectId,
    uint256 _amount,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token
  ) internal {
    if (_projectId == 0) {
      revert PROJECT_NOT_FOUND();
    }
    require(_projectId != 0, '0x01: PROJECT_NOT_FOUND');

    // Find the terminal for this contract's project.
    IJBTerminal _terminal = directory.primaryTerminalOf(_projectId, _token);

    // There must be a terminal.
    if (_terminal == IJBTerminal(address(0))) {
      revert TERMINAL_NOT_FOUND();
    }

    // There must be enough funds in the contract to take the fee.
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
      bytes('')
    );
  }

  /** 
      @notice See the documentation from `pay`.
    */
  function _pay(
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token
  ) private {
    if (projectId == 0) {
      revert PROJECT_NOT_FOUND();
    }

    // Get the terminal for this contract's project.
    IJBTerminal _terminal = directory.primaryTerminalOf(projectId, _token);

    // There must be a terminal.
    if (_terminal == IJBTerminal(address(0))) {
      revert TERMINAL_NOT_FOUND();
    }

    _terminal.pay{value: msg.value}(
      projectId,
      _beneficiary,
      0,
      _preferClaimedTokens,
      _memo,
      bytes('')
    );
  }
}
