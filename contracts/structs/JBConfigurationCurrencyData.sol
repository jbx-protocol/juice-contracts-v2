// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBConfigurationCurrencyData {
  // The configuration during which the new currency was set.
  uint56 configuration;
  // The currency that is being configured.
  uint8 currency;
}
