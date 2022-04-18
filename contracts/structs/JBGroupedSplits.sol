// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './JBSplit.sol';

struct JBGroupedSplits {
  // The group indentifier.
  uint256 group;
  // The splits to associate with the group.
  JBSplit[] splits;
}
