// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleBallot.sol';

struct JBFundingCycleData {
  // The target of the funding cycle.
  // This number is interpreted as a wad, meaning it has 18 decimal places.
  // A value of 0 means that all funds in the treasury are overflow.
  // A value of uint256.max() means that the entire treasury can be distributed to the preprogrammed payout splits at anytime.
  // A value in betweem, say 3 x 10^18, means that up to 3 (ETH, USD, ...) can be distributed to splits, and the rest of the treasury is overflow.
  uint256 target;
  // The currency of the funding cycle. 0 is ETH, 1 is USD.
  uint256 currency;
  // The duration of the funding cycle in days.
  // A duration of 0 is no duration, meaning projects can trigger a new funding cycle on demand by issueing a reconfiguration.
  uint256 duration;
  // The weight of the funding cycle.
  // This number is interpreted as a wad, meaning it has 18 decimal places.
  // The protocol uses the weight to determine how many tokens to mint upon receiving a payment during a funding cycle.
  // A value of 0 means that the weight should be inherited and potentially discounted from the currently active cycle if possible. Otherwise a weight of 0 will be used.
  // A value of 1 means that no tokens should be minted regardless of how many ETH was paid. The protocol will set the stored weight value to 0.
  // A value of 1 X 10^18 means that one token should be minted per ETH received.
  uint256 weight;
  // The discount rate of the funding cycle. This number is a percentage calculated out of 10000.
  // The protocol will use the discount rate to reduce the weight of the subsequent funding cycle by this percentage compared to this cycle's weight.
  uint256 discountRate;
  // The ballot of the funding cycle.
  IJBFundingCycleBallot ballot;
}
