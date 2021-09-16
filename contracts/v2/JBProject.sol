// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IJBDirectory.sol";

/** 
  @notice A contract that inherits from JuiceboxProject can use Juicebox as a business-model-as-a-service.
  @dev The owner of the contract makes admin decisions such as:
    - Which address is the funding cycle owner, which can withdraw funds from the funding cycle.
    - Should this project's Tickets be migrated to a new TerminalV1. 
*/
abstract contract PayableJuicebox is Ownable {
    /// @notice The direct deposit terminals.
    IJBDirectory immutable directory;

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
      Received funds go streight to the project.
    */
    receive() external payable {
        _pay(msg.sender, "", false);
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
      @param _preferUnstakedTickets Whether ERC20's should be claimed automatically if they have been issued.
    */
    function pay(
        address _beneficiary,
        string memory _memo,
        bool _preferUnstakedTickets
    ) external payable returns (uint256) {
        return _pay(_beneficiary, _memo, _preferUnstakedTickets);
    }

    /** 
      @notice Take a fee for this project from this contract.
      @param _projectId The ID of the project being funded.
      @param _amount The payment amount.
      @param _beneficiary The address who will receive tickets from this fee.
      @param _memo A memo that will be included in the published event.
      @param _preferUnstakedTickets Whether ERC20's should be claimed automatically if they have been issued.
    */
    function _fundTreasury(
        uint256 _projectId,
        uint256 _amount,
        address _beneficiary,
        string memory _memo,
        bool _preferUnstakedTickets
    ) internal {
        _projectId = _projectId > 0 ? _projectId : projectId;

        require(
            _projectId != 0,
            "JuiceboxProject::_fundTreasury: PROJECT_NOT_FOUND"
        );

        // Find the terminal for this contract's project.
        IJBTerminal _terminal = directory.terminalOf(_projectId);

        // There must be a terminal.
        require(
            _terminal != IJBTerminal(address(0)),
            "JuiceboxProject::_fundTreasury: TERMINAL_NOT_FOUND"
        );

        // There must be enough funds in the contract to take the fee.
        require(
            address(this).balance >= _amount,
            "JuiceboxProject::_fundTreasury: INSUFFICIENT_FUNDS"
        );

        // Send funds to the terminal.
        _terminal.pay{value: _amount}(
            _projectId,
            _beneficiary,
            0,
            _preferUnstakedTickets,
            _memo,
            bytes("")
        );
    }

    /** 
      @notice See the documentation from `pay`.
    */
    function _pay(
        address _beneficiary,
        string memory _memo,
        bool _preferUnstakedTickets
    ) private returns (uint256) {
        require(projectId != 0, "JuiceboxProject::_pay: PROJECT_NOT_FOUND");

        // Get the terminal for this contract's project.
        IJBTerminal _terminal = directory.terminalOf(projectId);

        // There must be a terminal.
        require(
            _terminal != IJBTerminal(address(0)),
            "JuiceboxProject::_pay: TERMINAL_NOT_FOUND"
        );

        return
            _terminal.pay{value: msg.value}(
                projectId,
                _beneficiary,
                0,
                _preferUnstakedTickets,
                _memo,
                bytes("")
            );
    }
}
