// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

library JBErrors {
  error IndexOutOfBounds();
  error UNAUTHORIZED();
  error PROJECT_NOT_FOUND();
  error TERMINAL_NOT_FOUND();
  error INSUFFICIENT_FUNDS();
  error EMPTY_NAME();
  error EMPTY_SYMBOL();
  error ALREADY_ISSUED();
  error NO_OP();
  error NOT_FOUND();
  error ZERO_ADDRESS();
  error IDENTITY();
  error SOME_LOCKED();
  error BAD_SPLIT_PERCENT();
  error BAD_TOTAL_PERCENT();
  error EMPTY_HANDLE();
  error HANDLE_TAKEN();
  error HANDLE_NOT_TAKEN();
  error CHALLENGE_OPEN();
  error ALREADY_EXISTS();
  error BAD_DURATION();
  error BAD_DISCOUNT_RATE();
  error BAD_WEIGHT();
  error NON_RECURRING();
  error PAUSED();
  error INADEQUATE();
  error UNEXPECTED_CURRENCY();
  error LIMIT_REACHED();
  error NOT_ALLOWED();
  error INSUFFICIENT_TOKENS();
  error ALREADY_CLAIMED();
  error INCOMPATIBLE();
  error BAD_FEE();
  error BAD_SPLIT();
  error ALREADY_SET();
  error BAD_RESERVED_RATE();
  error BAD_REDEMPTION_RATE();
  error BAD_BALLOT_REDEMPTION_RATE();
}
