// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

interface IJBExpirySource {
  function getExpiryFor(uint256 projectId) external view returns (uint256 challengeExpiry);
}
