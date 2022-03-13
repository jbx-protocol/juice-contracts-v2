// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBPaymentTerminal.sol';

import './JBAmount.sol';

struct JBPayParamsData {
  // The terminal that is facilitating the payment.
  IJBPaymentTerminal terminal;
  // The address from which the payment originated.
  address payer;
  // The amount of the payment. Includes the token being paid, the value, the number of decimals included, and the currency of the amount.
  JBAmount amount;
  // The ID of the project being paid.
  uint256 projectId;
  // The weight of the funding cycle during which the payment is being made.
  uint256 weight;
  // The reserved rate of the funding cycle during which the payment is being made.
  uint256 reservedRate;
  // The proposed beneficiary of the tokens that will be minted as a result of the tokens.
  address beneficiary;
  // The proposed memo that is being emitted alongside the payment.
  string memo;
  // Arbitrary metadata provided by the payer.
  bytes metadata;
}
