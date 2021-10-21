// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBPayParamsData {
  // The address from which the payment originated.
  address payer;
  // The ETH amount of the payment.
  uint256 amount;
  // The weight of the funding cycle during which the payment is being made.
  uint256 weight;
  // The reserved rate of the funding cycle during which the payment is being made.
  uint256 reservedRate;
  // The proposed beneficiary of the tokens that will be minted as a result of the tokens.
  address beneficiary;
  // The proposed memo that is being emitted alongside the payment.
  string memo;
  // The proposed metadata to send to the delegate.
  bytes delegateMetadata;
}
