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
    // Redemption rate is a number 0-10000. It's inverse was stored so the most common case of 100% results in no storage needs.
    return 10000 - uint256(uint16(_fundingCycle.metadata >> 24));
  }

  function ballotRedemptionRate(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (uint256)
  {
    // Redemption rate is a number 0-10000. It's inverse was stored so the most common case of 100% results in no storage needs.
    return 10000 - uint256(uint16(_fundingCycle.metadata >> 40));
  }

  function payPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 56) & 1) == 0;
  }

  function distributionsPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 57) & 1) == 0;
  }

  function redeemPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 58) & 1) == 0;
  }

  function mintPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 59) & 1) == 0;
  }

  function burnPaused(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 60) & 1) == 0;
  }

  function changeTokenAllowed(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 61) & 1) == 0;
  }

  function terminalMigrationAllowed(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return ((_fundingCycle.metadata >> 62) & 1) == 0;
  }

  function controllerMigrationAllowed(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return ((_fundingCycle.metadata >> 63) & 1) == 0;
  }

  function shouldHoldFees(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return ((_fundingCycle.metadata >> 64) & 1) == 0;
  }

  function shouldUseLocalBalanceForRedemptions(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return ((_fundingCycle.metadata >> 65) & 1) == 0;
  }

  function useDataSourceForPay(JBFundingCycle memory _fundingCycle) internal pure returns (bool) {
    return (_fundingCycle.metadata >> 66) & 1 == 0;
  }

  function useDataSourceForRedeem(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (bool)
  {
    return (_fundingCycle.metadata >> 67) & 1 == 0;
  }

  function dataSource(JBFundingCycle memory _fundingCycle)
    internal
    pure
    returns (IJBFundingCycleDataSource)
  {
    return IJBFundingCycleDataSource(address(uint160(_fundingCycle.metadata >> 68)));
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
    // reserved rate in bits 8-23.
    packed |= _metadata.reservedRate << 8;
    // bonding curve in bits 24-39.
    // Redemption rate is a number 0-10000. Store the reverse so the most common case of 100% results in no storage needs.
    packed |= (10000 - _metadata.redemptionRate) << 24;
    // reconfiguration bonding curve rate in bits 40-55.
    // Redemption rate is a number 0-10000. Store the reverse so the most common case of 100% results in no storage needs.
    packed |= (10000 - _metadata.ballotRedemptionRate) << 50;
    // pause pay in bit 56.
    packed |= (_metadata.pausePay ? 1 : 0) << 56;
    // pause tap in bit 57.
    packed |= (_metadata.pauseDistributions ? 1 : 0) << 57;
    // pause redeem in bit 58.
    packed |= (_metadata.pauseRedeem ? 1 : 0) << 58;
    // pause mint in bit 59.
    packed |= (_metadata.pauseMint ? 1 : 0) << 59;
    // pause mint in bit 60.
    packed |= (_metadata.pauseBurn ? 1 : 0) << 60;
    // pause change token in bit 61.
    packed |= (_metadata.allowChangeToken ? 1 : 0) << 61;
    // allow terminal migration in bit 62.
    packed |= (_metadata.allowTerminalMigration ? 1 : 0) << 62;
    // allow controller migration in bit 63.
    packed |= (_metadata.allowControllerMigration ? 1 : 0) << 63;
    // hold fees in bit 64.
    packed |= (_metadata.holdFees ? 1 : 0) << 64;
    // useLocalBalanceForRedemptions in bit 65.
    packed |= (_metadata.useLocalBalanceForRedemptions ? 1 : 0) << 65;
    // use pay data source in bit 66.
    packed |= (_metadata.useDataSourceForPay ? 1 : 0) << 66;
    // use redeem data source in bit 67.
    packed |= (_metadata.useDataSourceForRedeem ? 1 : 0) << 67;
    // data source address in bits 68-227.
    packed |= uint160(address(_metadata.dataSource)) << 68;
  }
}
