// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../structs/JBSplit.sol';
import './IJBSplitsStore.sol';

interface IJBSplitsPayer {
  function defaultSplitsDomain() external view returns (uint256);

  function splitsStore() external view returns (IJBSplitsStore);

  function setDefaultSplits(JBSplit[] memory _splits) external;
}
