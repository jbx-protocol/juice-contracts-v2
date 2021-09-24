// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct DidRedeemData {
  address holder;
  uint256 projectId;
  uint256 tokenCount;
  uint256 claimAmount;
  address payable beneficiary;
  string memo;
  bytes metadata;
}
