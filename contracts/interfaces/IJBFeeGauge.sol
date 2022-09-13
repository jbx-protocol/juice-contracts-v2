// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IJBFeeGauge {
  function currentDiscountFor(uint256 _projectId) external view returns (uint256);
}
