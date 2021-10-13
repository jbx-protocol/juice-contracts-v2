// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';

import './abstract/JBTerminalUtility.sol';

import './interfaces/IJBDirectory.sol';
import './interfaces/IJBVault.sol';

contract JBETHPaymentTerminal is IJBVault, JBTerminalUtility {
  function token() external pure override returns (address) {
    return address(0);
  }

  /** 
    @param _directory The directory of terminals.
  */
  constructor(IJBDirectory _directory) JBTerminalUtility(_directory) {}

  function deposit(uint256 _projectId, uint256 _amount)
    external
    payable
    override
    onlyTerminal(_projectId)
  {}

  function withdraw(
    uint256 _projectId,
    uint256 _amount,
    address payable _to
  ) external override onlyTerminal(_projectId) {
    Address.sendValue(_to, _amount);
  }
}
