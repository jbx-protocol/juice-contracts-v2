const deployAddress = require('./deploy_address');
const setPayerPreferences = require('./set_payer_preferences');
const setTerminal = require('./set_terminal');

const contractName = 'TerminalDirectory';

module.exports = function () {
  // Before the tests, deploy the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.projects = await this.deployMockLocalContractFn('Projects');
    this.operatorStore = await this.deployMockLocalContractFn('OperatorStore');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [
      this.projects.address,
      this.operatorStore.address,
    ]);
  });

  // Test each function.
  describe('deployAddress(...)', deployAddress);
  describe('setTerminal(...)', setTerminal);
  describe('setPayerPreferences(...)', setPayerPreferences);
};
