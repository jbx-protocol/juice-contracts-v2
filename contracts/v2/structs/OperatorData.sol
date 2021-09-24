// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct OperatorData {
  address operator;
  uint256 domain;
  uint256[] permissionIndexes;
}
