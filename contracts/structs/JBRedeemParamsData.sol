// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBRedeemParamsData {
  // The holder of the tokens being redeemed.
  address holder;
  // The proposed number of tokens being redeemed.
  uint256 tokenCount;
  // The redemption rate of the funding cycle during which the redemption is being made.
  uint256 redemptionRate;
  // The ballot redemption rate of the funding cycle during which the redemption is being made.
  uint256 ballotRedemptionRate;
  // The proposed beneficiary of the ETH being claimed by making the redemption.
  address beneficiary;
  // The proposed memo that is being emitted alongside the redemption.
  string memo;
  // The proposed metadata to send to the delegate.
  bytes delegateMetadata;
}
