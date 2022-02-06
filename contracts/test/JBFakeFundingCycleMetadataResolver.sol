// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '../libraries/JBFundingCycleMetadataResolver.sol';

/**
  @dev
  Fake contract used for testing internal JBFundingCycleMetadataResolver lib methods
*/
contract JBFakeFundingCycleMetadataResolver {
  function packFundingCycleMetadata(JBFundingCycleMetadata memory _metadata)
    external
    pure
    returns (uint256)
  {
    return JBFundingCycleMetadataResolver.packFundingCycleMetadata(_metadata);
  }

  function reservedRate(JBFundingCycle memory _fundingCycle) external pure returns (uint256) {
    return JBFundingCycleMetadataResolver.reservedRate(_fundingCycle);
  }

  function redemptionRate(JBFundingCycle memory _fundingCycle) external pure returns (uint256) {
    return JBFundingCycleMetadataResolver.redemptionRate(_fundingCycle);
  }

  function ballotRedemptionRate(JBFundingCycle memory _fundingCycle)
    external
    pure
    returns (uint256)
  {
    return JBFundingCycleMetadataResolver.ballotRedemptionRate(_fundingCycle);
  }

  function payPaused(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.payPaused(_fundingCycle);
  }

  function distributionsPaused(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.distributionsPaused(_fundingCycle);
  }

  function redeemPaused(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.redeemPaused(_fundingCycle);
  }

  function mintPaused(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.mintPaused(_fundingCycle);
  }

  function burnPaused(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.burnPaused(_fundingCycle);
  }

  function changeTokenAllowed(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.changeTokenAllowed(_fundingCycle);
  }

  function terminalMigrationAllowed(JBFundingCycle memory _fundingCycle)
    external
    pure
    returns (bool)
  {
    return JBFundingCycleMetadataResolver.terminalMigrationAllowed(_fundingCycle);
  }

  function controllerMigrationAllowed(JBFundingCycle memory _fundingCycle)
    external
    pure
    returns (bool)
  {
    return JBFundingCycleMetadataResolver.controllerMigrationAllowed(_fundingCycle);
  }

  function shouldHoldFees(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.shouldHoldFees(_fundingCycle);
  }

  function shouldUseLocalBalanceForRedemptions(JBFundingCycle memory _fundingCycle)
    external
    pure
    returns (bool)
  {
    return JBFundingCycleMetadataResolver.shouldUseLocalBalanceForRedemptions(_fundingCycle);
  }

  function useDataSourceForPay(JBFundingCycle memory _fundingCycle) external pure returns (bool) {
    return JBFundingCycleMetadataResolver.useDataSourceForPay(_fundingCycle);
  }

  function useDataSourceForRedeem(JBFundingCycle memory _fundingCycle)
    external
    pure
    returns (bool)
  {
    return JBFundingCycleMetadataResolver.useDataSourceForRedeem(_fundingCycle);
  }

  function dataSource(JBFundingCycle memory _fundingCycle)
    external
    pure
    returns (IJBFundingCycleDataSource)
  {
    return JBFundingCycleMetadataResolver.dataSource(_fundingCycle);
  }
}
