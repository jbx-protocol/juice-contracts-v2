// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleStore.sol';
import './../interfaces/IJBFundingCycleDataSource.sol';
import './../structs/JBFundingCycleMetadata.sol';

library JBFundingCycleMetadataResolver {
  function reservedRate(JBFundingCycle memory _fundingCycle) internal pure returns (uint256) {
    return uint256(uint16(_fundingCycle.metadata >> 8));
  }

  function redemptionRate(JBFundingCycle memory _fundingCycle) internal pure returns (uint256) {
    return uint256(uint16(_fundingCycle.metadata >> 24));
  }

  function ballotRedemptionRate(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (uint256)
  {
    return uint256(uint16(_fundingCycle.metadata >> 32));
  }

  function payPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 40) & 1) == 0;
  }

  function distributionsPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 41) & 1) == 0;
  }

  function redeemPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 42) & 1) == 0;
  }

  function mintPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 43) & 1) == 0;
  }

  function burnPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 44) & 1) == 0;
  }

  function terminalMigrationAllowed(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return ((_fundingCycle.metadata >> 45) & 1) == 0;
  }

  function controllerMigrationAllowed(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return ((_fundingCycle.metadata >> 46) & 1) == 0;
  }

  function shouldHoldFees(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 47) & 1) == 0;
  }

  function useDataSourceForPay(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return (_fundingCycle.metadata >> 48) & 1 == 0;
  }

  function useDataSourceForRedeem(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return (_fundingCycle.metadata >> 49) & 1 == 0;
  }

  function dataSource(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (IJBFundingCycleDataSource)
  {
    return IJBFundingCycleDataSource(address(uint160(_fundingCycle.metadata >> 50)));
  }

  /**
    @notice
    Pack the funding cycle metadata.

    @param _metadata The metadata to validate and pack.

    @return packed The packed uint256 of all metadata params. The first 8 bytes specify the version.
  */
  function packFundingCycleMetadata(JBFundingCycleMetadata memory _metadata)
    internal
    pure
    returns (uint256 packed)
  {
    // version 1 in the first 8 bytes.
    packed = 1;
    // reserved rate in bits 8-15.
    packed |= _metadata.reservedRate << 8;
    // bonding curve in bits 16-23.
    packed |= _metadata.redemptionRate << 16;
    // reconfiguration bonding curve rate in bits 24-31.
    packed |= _metadata.ballotRedemptionRate << 24;
    // pause pay in bit 32.
    packed |= (_metadata.pausePay ? 1 : 0) << 32;
    // pause tap in bit 33.
    packed |= (_metadata.pauseDistributions ? 1 : 0) << 33;
    // pause redeem in bit 34.
    packed |= (_metadata.pauseRedeem ? 1 : 0) << 34;
    // pause mint in bit 35.
    packed |= (_metadata.pauseMint ? 1 : 0) << 35;
    // pause mint in bit 36.
    packed |= (_metadata.pauseBurn ? 1 : 0) << 36;
    // allow terminal migration in bit 37.
    packed |= (_metadata.allowTerminalMigration ? 1 : 0) << 37;
    // allow controller migration in bit 38.
    packed |= (_metadata.allowControllerMigration ? 1 : 0) << 38;
    // hold fees in bit 39.
    packed |= (_metadata.holdFees ? 1 : 0) << 39;
    // use pay data source in bit 40.
    packed |= (_metadata.useDataSourceForPay ? 1 : 0) << 40;
    // use redeem data source in bit 41.
    packed |= (_metadata.useDataSourceForRedeem ? 1 : 0) << 41;
    // data source address in bits 42-201.
    packed |= uint160(address(_metadata.dataSource)) << 42;
  }
}
