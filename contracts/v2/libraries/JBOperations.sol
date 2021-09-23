// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

library JBOperations {
  uint256 public constant CONFIGURE = 1;
  uint256 public constant PRINT_PREMINED_TOKENS = 2;
  uint256 public constant REDEEM = 3;
  uint256 public constant MIGRATE_CONTROLLER = 4;
  uint256 public constant MIGRATE_TERMINAL = 5;
  uint256 public constant SET_HANDLE = 6;
  uint256 public constant SET_URI = 7;
  uint256 public constant CLAIM_HANDLE = 8;
  uint256 public constant RENEW_HANDLE = 9;
  uint256 public constant ISSUE = 10;
  uint256 public constant STAKE = 11;
  uint256 public constant UNSTAKE = 12;
  uint256 public constant TRANSFER = 13;
  uint256 public constant LOCK = 14;
  uint256 public constant SET_CONTROLLER = 15;
  uint256 public constant ADD_TERMINAL = 16;
  uint256 public constant REMOVE_TERMINAL = 17;
  uint256 public constant USE_ALLOWANCE = 18;
  uint256 public constant BURN = 19;
  uint256 public constant MINT = 20;
  uint256 public constant SET_SPLITS = 21;
}
