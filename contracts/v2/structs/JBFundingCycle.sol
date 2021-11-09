// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleBallot.sol';

struct JBFundingCycle {
  // The number of this funding cycle for the project.
  uint256 number;
  // The ID of a previous funding cycle that this one is based on.
  uint256 basedOn;
  // The time when this funding cycle was configured.
  uint256 configuration;
  // A number that contracts can use to base arbitrary calculations on.
  uint256 weight;
  // The ballot contract to use to determine a subsequent funding cycle's reconfiguration status.
  IJBFundingCycleBallot ballot;
  // The time from when this funding cycle becomes active.
  uint256 start;
  // The number of days this funding cycle lasts for. A value of 0 means this funding cycle lasts until an explicit reconfiguration.
  uint256 duration;
  // A percentage by which the `weight` of the subsequent funding cycle should be reduced, if the project owner hasn't configured the subsequent funding cycle with an explicit `weight`.
  uint256 discountRate;
  // Extra data that can be associated with a funding cycle.
  uint256 metadata;
}
