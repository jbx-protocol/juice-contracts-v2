// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBConfigurationOverflowAllowanceData {
  // The configuration during which the new overflow allowance was set.
  uint56 configuration;
  // The overflow allowance that is being configured.
  uint256 overflowAllowance;
}
