// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

library JBOperations {
  uint256 public constant RECONFIGURE = 1;
  uint256 public constant PRINT_PREMINED_TOKENS = 2;
  uint256 public constant REDEEM = 3;
  uint256 public constant MIGRATE_CONTROLLER = 4;
  uint256 public constant MIGRATE_TERMINAL = 5;
  uint256 public constant PROCESS_FEES = 6;
  uint256 public constant SET_HANDLE = 7;
  uint256 public constant SET_METADATA_CID = 8;
  uint256 public constant CLAIM_HANDLE = 9;
  uint256 public constant RENEW_HANDLE = 10;
  uint256 public constant ISSUE = 11;
  uint256 public constant CHANGE_TOKEN = 12;
  uint256 public constant MINT = 13;
  uint256 public constant BURN = 14;
  uint256 public constant TRANSFER = 15;
  uint256 public constant REQUIRE_CLAIM = 16;
  uint256 public constant SET_CONTROLLER = 17;
  uint256 public constant ADD_TERMINAL = 18;
  uint256 public constant REMOVE_TERMINAL = 19;
  uint256 public constant SET_PRIMARY_TERMINAL = 20;
  uint256 public constant USE_ALLOWANCE = 21;
  uint256 public constant SET_SPLITS = 22;
}
