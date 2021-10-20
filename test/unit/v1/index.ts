const directPaymentAddress = require('./direct_payment_address');
const fundingCycles = require('./funding_cycles');
const governance = require('./governance');
const juiceboxProject = require('./juice_project');
const modStore = require('./mod_store');
const operatorStore = require('./operator_store');
const prices = require('./prices');
const projects = require('./projects');
const proxyPaymentAddress = require('./proxy_payment_address');
const proxyPaymentAddressManager = require('./proxy_payment_address_manager');
const terminalDirectory = require('./terminal_directory');
const terminalV1 = require('./terminal_v1');
const ticketBooth = require('./ticket_booth');

let snapshotId;
module.exports = function () {
  beforeEach(async function () {
    snapshotId = await this.snapshotFn();
    // Mark the start time of each test.
    await this.setTimeMarkFn();
  });
  // Test each contract.
  describe('OperatorStore', operatorStore);
  describe('Prices', prices);
  describe('Projects', projects);
  describe('TerminalDirectory', terminalDirectory);
  describe('Governance', governance);
  describe('JuiceboxProject', juiceboxProject);
  // Depends on TerminalDirectory.
  describe('FundingCycles', fundingCycles);
  // Depends on TerminalDirectory.
  describe('DirectPaymentAddress', directPaymentAddress);
  // Depends on OperatorStore and Projects.
  describe('ModStore', modStore);
  // Depends on OperatorStore and Projects.
  describe('TicketBooth', ticketBooth);
  // TODO: dependency
  describe('ProxyPaymentAddress', proxyPaymentAddress);
  describe('ProxyPaymentAddressManager', proxyPaymentAddressManager);
  // Depends on everything.
  describe('TerminalV1', terminalV1);

  // After each test, restore the contract state.
  afterEach(async function () {
    await this.restoreFn(snapshotId);
  });
};
