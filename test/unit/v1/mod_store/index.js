import { deployContract, deployMockLocalContract } from '../../../helpers/utils';

import setPaymentMods from './set_payment_mods';
import setTicketMods from './set_ticket_mods';

const contractName = 'ModStore';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.projects = await deployMockLocalContract('Projects');
    this.operatorStore = await deployMockLocalContract('OperatorStore');
    this.terminalDirectory = await deployMockLocalContract('TerminalDirectory');
    this.modAllocator = await deployMockLocalContract('ExampleModAllocator');

    // Deploy the contract.
    this.contract = await deployContract(contractName, [
      this.projects.address,
      this.operatorStore.address,
      this.terminalDirectory.address,
    ]);
  });

  // Test each function.
  describe('setPaymentMods(...)', setPaymentMods);
  describe('setTicketMods(...)', setTicketMods);
}
