// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct DidPayData {
  address payer;
  uint256 projectId;
  uint256 amount;
  uint256 weight;
  uint256 count;
  address beneficiary;
  string memo;
  bytes delegateMetadata;
}
