// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

library JBOperations {
  uint256 public constant CONFIGURE = 1;
  uint256 public constant PRINT_PREMINED_TOKENS = 2;
  uint256 public constant REDEEM = 3;
  uint256 public constant MIGRATE = 4;
  uint256 public constant SET_HANDLE = 5;
  uint256 public constant SET_URI = 6;
  uint256 public constant CLAIM_HANDLE = 7;
  uint256 public constant RENEW_HANDLE = 8;
  uint256 public constant ISSUE = 9;
  uint256 public constant STAKE = 10;
  uint256 public constant UNSTAKE = 11;
  uint256 public constant TRANSFER = 12;
  uint256 public constant LOCK = 13;
  uint256 public constant SET_TERMINAL = 14;
  uint256 public constant USE_ALLOWANCE = 15;
  uint256 public constant BURN = 16;
  uint256 public constant MINT = 17;
  uint256 public constant SET_SPLITS = 18;
}
