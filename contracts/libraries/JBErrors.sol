// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// --------------------------- custom errors -------------------------- //
//*********************************************************************//
library JBErrors {
  error INSUFFICIENT_FUNDS();
  error NO_OP();
  error NOT_FOUND();
  error NOT_ALLOWED();
  error PAUSED();
  error UNAUTHORIZED();
  error ZERO_ADDRESS();
}
