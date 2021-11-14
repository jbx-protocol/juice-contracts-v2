import { snapshot as takeSnapshot } from '@openzeppelin/test-helpers';

import directPaymentAddress from './direct_payment_address';
import fundingCycles from './funding_cycles';
import governance from './governance';
import juiceboxProject from './juice_project';
import modStore from './mod_store';
import operatorStore from './operator_store';
import prices from './prices';
import projects from './projects';
import proxyPaymentAddress from './proxy_payment_address';
import proxyPaymentAddressManager from './proxy_payment_address_manager';
import terminalDirectory from './terminal_directory';
import terminalV1 from './terminal_v1';
import ticketBooth from './ticket_booth';

let snapshot;
export default function () {
  beforeEach(async function () {
    snapshot = await takeSnapshot();
    // Mark the start time of each test.
    //await this.setTimeMarkFn();
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
    await snapshot.restore();
  });
}
