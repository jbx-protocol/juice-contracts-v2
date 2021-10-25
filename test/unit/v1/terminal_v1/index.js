import { deployMockLocalContract } from '../../../utils';

import acceptGovernance from './accept_governance';
import addToBalance from './add_to_balance';
import allowMigration from './allow_migration';
import appointGovernance from './appoint_governance';
import configure from './configure';
import deploy from './deploy';
import migrate from './migrate';
import pay from './pay';
import printPreminedTickets from './print_premined_tickets';
import printReservedTickets from './print_reserved_tickets';
import redeem from './redeem';
import setFee from './set_fee';
import tap from './tap';

const contractName = 'TerminalV1';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    const operatorStore = await deployMockLocalContract('OperatorStore');
    const projects = await deployMockLocalContract('Projects', [operatorStore.address]);
    const prices = await deployMockLocalContract('Prices');
    const terminalDirectory = await deployMockLocalContract('TerminalDirectory', [
      projects.address,
      operatorStore.address,
    ]);
    const fundingCycles = await deployMockLocalContract('FundingCycles', [
      terminalDirectory.address,
    ]);
    const ticketBooth = await deployMockLocalContract('TicketBooth', [
      projects.address,
      operatorStore.address,
      terminalDirectory.address,
    ]);
    const modStore = await deployMockLocalContract('ModStore', [
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
}
