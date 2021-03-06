// solidity-coverage configuration file.
//
// https://www.npmjs.com/package/solidity-coverage

module.exports = {
  skipFiles: [
    'system_tests/helpers/AccessJBLib.sol',
    'system_tests/helpers/hevm.sol',
    'system_tests/helpers/TestBaseWorkflow.sol',
    'system_tests/mock/MockPriceFeed.sol',
    'system_tests/TestAllowance.sol',
    'system_tests/TestERC20Terminal.sol',
    'system_tests/TestLaunchProject.sol',
    'system_tests/TestMultipleTerminals.sol',
    'system_tests/TestPayBurnRedeemFlow.sol',
    'system_tests/TestTokenFlow.sol',
    'libraries/JBConstants.sol',
    'libraries/JBCurrencies.sol',
    'libraries/JBFixedPointNumber.sol',
    'libraries/JBFundingCycleMetadataResolver.sol',
    'libraries/JBOperations.sol',
    'libraries/JBSplitsGroups.sol',
    'libraries/JBTokens.sol',
    'structs/JBDidPayData.sol',
    'structs/JBDidRedeemData.sol',
    'structs/JBFee.sol',
    'structs/JBFundAccessConstraints.sol',
    'structs/JBFundingCycle.sol',
    'structs/JBFundingCycleData.sol',
    'structs/JBFundingCycleMetadata.sol',
    'structs/JBGroupedSplits.sol',
    'structs/JBOperatorData.sol',
    'structs/JBPayParamsData.sol',
    'structs/JBProjectMetadata.sol',
    'structs/JBRedeemParamsData.sol',
    'structs/JBSplit.sol',
    'structs/JBSplitAllocationData.sol',
    'structs/JBTokenAmount.sol',
    'interfaces/IJBController.sol',
    'interfaces/IJBControllerUtility.sol',
    'interfaces/IJBDirectory.sol',
    'interfaces/IJBETHERC20ProjectPayerDeployer.sol',
    'interfaces/IJBFeeGauge.sol',
    'interfaces/IJBFundingCycleBallot.sol',
    'interfaces/IJBFundingCycleDataSource.sol',
    'interfaces/IJBFundingCycleStore.sol',
    'interfaces/IJBOperatable.sol',
    'interfaces/IJBOperatorStore.sol',
    'interfaces/IJBPayDelegate.sol',
    'interfaces/IJBPaymentTerminal.sol',
    'interfaces/IJBPaymentTerminalStore.sol',
    'interfaces/IJBPayoutRedemptionPaymentTerminal.sol',
    'interfaces/IJBPriceFeed.sol',
    'interfaces/IJBPrices.sol',
    'interfaces/IJBProjectPayer.sol',
    'interfaces/IJBProjects.sol',
    'interfaces/IJBRedemptionDelegate.sol',
    'interfaces/IJBSplitAllocator.sol',
    'interfaces/IJBSplitsStore.sol',
    'interfaces/IJBTerminalUtility.sol',
    'interfaces/IJBToken.sol',
    'interfaces/IJBTokenStore.sol',
    'interfaces/IJBTokenUriResolver.sol',
  ],
  configureYulOptimizer: true,
  measureStatementCoverage: false,
};
