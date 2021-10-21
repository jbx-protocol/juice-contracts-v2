// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBTerminal.sol';

struct JBOverflowAllowance {
  // The terminal within which the overflow allowance applies.
  IJBTerminal terminal;
  // The amount of the allowance.
  uint256 amount;
}
