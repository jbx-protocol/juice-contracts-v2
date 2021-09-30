const acceptGovernance = require('./accept_governance');
const addToBalance = require('./add_to_balance');
const allowMigration = require('./allow_migration');
const appointGovernance = require('./appoint_governance');
const configure = require('./configure');
const deploy = require('./deploy');
const migrate = require('./migrate');
const pay = require('./pay');
const printPreminedTickets = require('./print_premined_tickets');
const printReservedTickets = require('./print_reserved_tickets');
const redeem = require('./redeem');
const setFee = require('./set_fee');
const tap = require('./tap');

const contractName = 'TerminalV1';

module.exports = function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    const operatorStore = await this.deployMockLocalContractFn('OperatorStore');
    const projects = await this.deployMockLocalContractFn('Projects', [operatorStore.address]);
    const prices = await this.deployMockLocalContractFn('Prices');
    const terminalDirectory = await this.deployMockLocalContractFn('TerminalDirectory', [
      projects.address,
      operatorStore.address,
    ]);
    const fundingCycles = await this.deployMockLocalContractFn('FundingCycles', [
      terminalDirectory.address,
    ]);
    const ticketBooth = await this.deployMockLocalContractFn('TicketBooth', [
      projects.address,
      operatorStore.address,
      terminalDirectory.address,
    ]);
    const modStore = await this.deployMockLocalContractFn('ModStore', [
      projects.address,
      operatorStore.address,
    ]);

    const governance = this.addrs[9];

    this.governance = governance;

    this.mockContracts = {
      operatorStore,
      projects,
      prices,
      terminalDirectory,
      fundingCycles,
      ticketBooth,
      modStore,
    };

    this.targetContract = await this.deployContractFn(contractName, [
      projects.address,
      fundingCycles.address,
      ticketBooth.address,
      operatorStore.address,
      modStore.address,
      prices.address,
      terminalDirectory.address,
      governance.address,
    ]);

    this.contractName = contractName;
  });

  // Test each function.
  describe('appointGovernance(...)', appointGovernance);
  describe('acceptGovernance(...)', acceptGovernance);
  describe('setFee(...)', setFee);
  describe('allowMigration(...)', allowMigration);
  describe('addToBalance(...)', addToBalance);
  describe('migrate(...)', migrate);
  describe('deploy(...)', deploy);
  describe('configure(...)', configure);
  describe('pay(...)', pay);
  describe('printPremineTickets(...)', printPreminedTickets);
  describe('redeem(...)', redeem);
  describe('tap(...)', tap);
  describe('printReservedTickets(...)', printReservedTickets);
};
