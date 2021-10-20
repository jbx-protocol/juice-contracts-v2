const pay = require('./pay');
const setOperator = require('./set_operator');
const setOperators = require('./set_operators');
const setProjectId = require('./set_project_id');
const takeFee = require('./take_fee');
const transferProjectOwnership = require('./transfer_project_ownership');
const withdraw = require('./withdraw');

const contractName = 'ExampleJuiceboxProject';

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
  describe('setOperator(...)', setOperator);
  describe('setOperators(...)', setOperators);
  describe('transferProjectOwnership(...)', transferProjectOwnership);
  describe('pay(...)', pay);
  describe('takeFee(...)', takeFee);
  describe('setProjectId(...)', setProjectId);
  describe('withdraw(...)', withdraw);
};
