// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBPaymentTerminal.sol';

struct JBRedeemParamsData {
  // The terminal that is facilitating the redemption.
  IJBPaymentTerminal terminal;
  // The holder of the tokens being redeemed.
  address holder;
  // The proposed number of tokens being redeemed.
  uint256 tokenCount;
  // The number of decimals included in the `reclaimAmount` fixed point number that should be returned.
  uint256 decimals;
  // The ID of the project whos tokens are being redeemed.
  uint256 projectId;
  // The redemption rate of the funding cycle during which the redemption is being made.
  uint256 redemptionRate;
  // The ballot redemption rate of the funding cycle during which the redemption is being made.
  uint256 ballotRedemptionRate;
  // The currency that the stored balance is expected to be in terms of.
  uint256 currency;
  // The proposed memo that is being emitted alongside the redemption.
  string memo;
  // Arbitrary metadata provided by the redeemer.
  bytes metadata;
}
