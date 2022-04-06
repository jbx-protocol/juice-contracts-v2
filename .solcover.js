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
'system_tests/TestTokenFlow.sol'
  ],
  configureYulOptimizer: true,
};