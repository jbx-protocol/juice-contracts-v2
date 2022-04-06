// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../structs/JBSplitAllocationData.sol';

interface IJBSplitAllocator {
  function allocate(JBSplitAllocationData calldata _data) external payable;
}
