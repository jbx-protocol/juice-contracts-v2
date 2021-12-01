// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBConfigurationFundingCycleMetadataData {
  // The configuration during which the new metadata was set.
  uint56 configuration;
  // The metadata that is being configured.
  uint256 metadata;
}
