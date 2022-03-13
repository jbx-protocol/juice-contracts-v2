// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBAmount {
  // The token the payment was made in.
  address token;
  // The amount of tokens that was paid, as a fixed point number.
  uint256 value;
  // The number of decimals included in th `amount` fixed point number.
  uint256 decimals;
  // The expected currency index of the value in reference to JBPRices feeds.
  uint256 currency;
}
