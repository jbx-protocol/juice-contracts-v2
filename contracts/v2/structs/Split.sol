// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBSplitAllocator.sol';

struct Split {
  bool preferUnstaked;
  uint16 percent;
  uint48 lockedUntil;
  address payable beneficiary;
  IJBSplitAllocator allocator;
  uint56 projectId;
}
