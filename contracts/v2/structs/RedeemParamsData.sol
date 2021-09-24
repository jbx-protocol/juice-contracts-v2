// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct RedeemParamsData {
  address holder;
  uint256 count;
  uint256 redemptionRate;
  uint256 ballotRedemptionRate;
  address beneficiary;
  string memo;
  bytes delegateMetadata;
}
