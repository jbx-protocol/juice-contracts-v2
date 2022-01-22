// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBTerminal.sol';

struct JBFundAccessConstraints {
  // The terminal within which the distribution limit and the overflow allowance applies.
  IJBTerminal terminal;
  // The amount of the distribution limit.
  uint248 distributionLimit;
  // The currency that the distribution limit are denoted in.
  uint8 distributionLimitCurrency;
  // The amount of the allowance.
  uint248 overflowAllowance;
  // The currency that the overflow allowance are denoted in.
  uint8 overflowAllowanceCurrency;
}
