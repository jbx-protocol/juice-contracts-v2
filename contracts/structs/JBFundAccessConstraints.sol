// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBTerminal.sol';

struct JBFundAccessConstraints {
  // The terminal within which the distribution limit and the overflow allowance applies.
  IJBTerminal terminal;
  // The amount of the distribution limit.
  uint256 distributionLimit;
  // The amount of the allowance.
  uint256 overflowAllowance;
  // The currency that the contraints are denoted in. Enumerated in JBCurrencies.sol
  uint256 currency;
}
