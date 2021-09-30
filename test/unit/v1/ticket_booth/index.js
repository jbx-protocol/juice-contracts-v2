const balanceOf = require('./balance_of');
const issue = require('./issue');
const lock = require('./lock');
const print = require('./print');
const redeem = require('./redeem');
const stake = require('./stake');
const totalSupplyOf = require('./total_supply_of');
const transfer = require('./transfer');
const unlock = require('./unlock');
const unstake = require('./unstake');

const contractName = 'TicketBooth';

module.exports = function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.projects = await this.deployMockLocalContractFn('Projects');
    this.operatorStore = await this.deployMockLocalContractFn('OperatorStore');
    this.terminalDirectory = await this.deployMockLocalContractFn('TerminalDirectory');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [
      this.projects.address,
      this.operatorStore.address,
      this.terminalDirectory.address,
    ]);
  });

  // Test each function.
  describe('issue(...)', issue);
  describe('print(...)', print);
  describe('unstake(...)', unstake);
  describe('stake(...)', stake);
  describe('transfer(...)', transfer);
  describe('redeem(...)', redeem);
  describe('lock(...)', lock);
  describe('unlock(...)', unlock);
  describe('balanceOf(...)', balanceOf);
  describe('totalSupplyOf(...)', totalSupplyOf);
};
