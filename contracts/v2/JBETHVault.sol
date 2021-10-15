// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';

import './abstract/JBTerminalUtility.sol';

import './interfaces/IJBDirectory.sol';
import './interfaces/IJBVault.sol';

/**
  @notice
  Stores ETH.
*/
contract JBETHVault is IJBVault, JBTerminalUtility {
  /** 
    @notice 
    The token that this vault is managing. 

    @dev
    ETH is represented as the zero address.

    @return The address of the token.
  */
  function token() external pure override returns (address) {
    return address(0);
  }

  /** 
    @param _directory A contract storing directories of terminals and controllers for each project.
  */
  constructor(IJBDirectory _directory) JBTerminalUtility(_directory) {}

  function deposit(uint256 _projectId, uint256) external payable override onlyTerminal(_projectId) {
    emit Deposit(_projectId, msg.value, msg.sender);
  }

  function withdraw(
    uint256 _projectId,
    uint256 _amount,
    address payable _to
  ) external override onlyTerminal(_projectId) {
    Address.sendValue(_to, _amount);
    emit Withdraw(_projectId, _amount, _to, msg.sender);
  }
}
