// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBDidRedeemData {
  // The holder of the tokens being redeemed.
  address holder;
  // The project to which the redeemed tokens are associated.
  uint256 projectId;
  // The number of project tokens being redeemed.
  uint256 projectTokenCount;
  // TODO
  address token;
  // The amount of tokens being reclaimed.
  uint256 reclaimedAmount;
  // TODO
  uint256 decimals;
  // The address to which the ETH will be sent.
  address payable beneficiary;
  // The memo that is being emitted alongside the redemption.
  string memo;
  // Metadata to send to the delegate.
  bytes metadata;
}
