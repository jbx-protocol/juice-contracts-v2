// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import '../structs/JBSplitAllocationData.sol';

interface IJBSplitAllocator is IERC165 {
  function allocate(JBSplitAllocationData calldata _data) external payable;
}
