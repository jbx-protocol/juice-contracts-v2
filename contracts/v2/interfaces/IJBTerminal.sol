// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBDirectory.sol';

interface IJBTerminal {
  function pay(
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTickets,
    bool _preferUnstakedTickets,
    string calldata _memo,
    bytes calldata _delegateMetadata
  ) external payable returns (uint256 fundingCycleId);

  function addToBalanceOf(uint256 _projectId, string memory _memo) external payable;
}
