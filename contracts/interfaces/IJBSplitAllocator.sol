// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../structs/JBSplit.sol';

interface IJBSplitAllocator {
  function allocate(
    uint256 _amount,
    uint256 _projectId,
    uint256 _group,
    JBSplit calldata _split
  ) external payable;
}
