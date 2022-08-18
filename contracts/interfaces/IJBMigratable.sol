// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

interface IJBMigratable {
  function prepForMigrationOf(uint256 _projectId, address _from) external;
}
