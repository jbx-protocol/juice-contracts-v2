// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBConfigurationFundingCyclePackedUserPropertiesData {
  // The packed user properties during which the new currency was set.
  uint56 configuration;
  // The packed user properties that is being configured.
  uint256 packedUserProperties;
}
