// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../structs/JBSplit.sol';
import './IJBSplitsStore.sol';

interface IJBSplitsPayer {
  function splitsStore() external view returns (IJBSplitsStore);

  function setSplits(JBSplit[] memory _splits) external;
}
