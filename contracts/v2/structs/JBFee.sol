// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBFee {
  // The amount of the fee.
  uint256 amount;
  // The address that will receive the tokens that are minted as a result of the fee payment.
  address beneficiary;
  // The memo that should be emitted alongside the fee payment.
  string memo;
}
