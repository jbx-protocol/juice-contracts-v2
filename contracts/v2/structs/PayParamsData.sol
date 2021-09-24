// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct PayParamsData {
  address payer;
  uint256 amount;
  uint256 weight;
  uint256 reservedRate;
  address beneficiary;
  string memo;
  bytes delegateMetadata;
}
