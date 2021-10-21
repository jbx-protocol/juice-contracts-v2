// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleBallot.sol';

struct JBFundingCycleData {
  // The target of the funding cycle.
  uint256 target;
  // The currency of the funding cycle. 0 is ETH, 1 is USD.
  uint256 currency;
  // The duration of the funding cycle.
  uint256 duration;
  // The discount rate of the funding cycle.
  uint256 discountRate;
  // The weight of the funding cycle. Send a weight of 1 to set a minimum.
  uint256 weight;
  // The ballot of the funding cycle.
  IJBFundingCycleBallot ballot;
}
