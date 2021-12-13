// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleBallot.sol';

struct JBFundingCycleData {
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
  // A number from 0-1000000001 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
  // If it's 0, each funding cycle will have equal weight.
  // If the number is 900000000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
  // If the number is 1000000001, an non-recurring funding cycle will get made.
  uint256 discountRate;
  // The amount that this funding cycle is targeting in terms of the currency.
  uint256 target;
  // An address of a contract that says whether a proposed reconfiguration should be accepted or rejected.
  IJBFundingCycleBallot ballot;
}
