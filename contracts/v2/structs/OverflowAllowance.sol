// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBTerminal.sol';

struct OverflowAllowance {
  IJBTerminal terminal;
  uint256 amount;
}
