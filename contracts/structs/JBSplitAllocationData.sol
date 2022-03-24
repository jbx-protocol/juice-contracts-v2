// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './JBSplit.sol';
import './JBTokenAmount.sol';

struct JBSplitAllocationData {
  // The amount being sent to the split allocator, as a fixed point number. The number of decimals is unknown, but should be derivable by the allocator.
  uint256 amount;
  // The project to which the split belongs.
  uint256 projectId;
  // The group to which the split belongs.
  uint256 group;
  // The split that caused the allocation.
  JBSplit split;
}
