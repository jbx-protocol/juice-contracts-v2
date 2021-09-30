const addPriceFeed = require('./add_price_feed');
const allowMigration = require('./allow_migration');
const appointGovernance = require('./appoint_governance');
const setFee = require('./set_fee');

const contractName = 'Governance';

module.exports = function () {
  // Before the tests, deploy the contract.
  before(async function () {
    this.projectId = 1;

    this.terminalDirectory = await this.deployMockLocalContractFn('TerminalDirectory');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [
      this.projectId,
      this.terminalDirectory.address,
    ]);
  });

  // Test each function.
  describe('allowMigration(...)', allowMigration);
  describe('addPriceFeed(...)', addPriceFeed);
  describe('setFee(...)', setFee);
  describe('appointGovernance(...)', appointGovernance);
};
