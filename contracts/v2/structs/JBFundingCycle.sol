// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleBallot.sol';

/// @notice The funding cycle structure represents a project stewarded by an address, and accounts for which addresses have helped sustain the project.
struct JBFundingCycle {
  // A unique number that's incremented for each new funding cycle, starting with 1.
  uint256 id;
  // The ID of the project contract that this funding cycle belongs to.
  uint256 projectId;
  // The number of this funding cycle for the project.
  uint256 number;
  // The ID of a previous funding cycle that this one is based on.
  uint256 basedOn;
  // The time when this funding cycle was last configured.
  uint256 configured;
  // A number determining the amount of redistribution shares this funding cycle will issue to each sustainer.
  uint256 weight;
  // The ballot contract to use to determine a subsequent funding cycle's reconfiguration status.
  IJBFundingCycleBallot ballot;
  // The time when this funding cycle will become active.
  uint256 start;
  // The number of seconds until this funding cycle's surplus is redistributed.
  uint256 duration;
  // A percentage indicating how much more weight to give a funding cycle compared to its predecessor.
  uint256 discountRate;
  // A packed list of extra data. The first 8 bytes are reserved for versioning.
  uint256 metadata;
}
