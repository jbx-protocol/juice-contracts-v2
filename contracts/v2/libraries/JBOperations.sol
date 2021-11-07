// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

library JBOperations {
  uint256 public constant RECONFIGURE = 1;
  uint256 public constant REDEEM = 2;
  uint256 public constant MIGRATE_CONTROLLER = 3;
  uint256 public constant MIGRATE_TERMINAL = 4;
  uint256 public constant PROCESS_FEES = 5;
  uint256 public constant SET_HANDLE = 6;
  uint256 public constant SET_METADATA_CID = 7;
  uint256 public constant CLAIM_HANDLE = 8;
  uint256 public constant RENEW_HANDLE = 9;
  uint256 public constant ISSUE = 10;
  uint256 public constant CHANGE_TOKEN = 11;
  uint256 public constant MINT = 12;
  uint256 public constant BURN = 13;
  uint256 public constant TRANSFER = 14;
  uint256 public constant REQUIRE_CLAIM = 15;
  uint256 public constant SET_CONTROLLER = 16;
  uint256 public constant ADD_TERMINAL = 17;
  uint256 public constant REMOVE_TERMINAL = 18;
  uint256 public constant SET_PRIMARY_TERMINAL = 19;
  uint256 public constant USE_ALLOWANCE = 20;
  uint256 public constant SET_SPLITS = 21;
}
