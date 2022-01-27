// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

interface IJBSplitAllocator {
  function allocate(
    uint256 _amount,
    uint256 _group,
    uint256 _projectId,
    uint256 _forProjectId,
    address _beneficiary,
    bool _preferClaimed
  ) external payable;
}
