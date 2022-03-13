// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './JBAmount.sol';

struct JBDidRedeemData {
  // The holder of the tokens being redeemed.
  address holder;
  // The project to which the redeemed tokens are associated.
  uint256 projectId;
  // The number of project tokens being redeemed.
  uint256 projectTokenCount;
  // The amount of the payment. Includes the token being paid, the value, the number of decimals included, and the currency of the amount.
  JBAmount reclaimedAmount;
  // The address to which the ETH will be sent.
  address payable beneficiary;
  // The memo that is being emitted alongside the redemption.
  string memo;
  // Metadata to send to the delegate.
  bytes metadata;
}
