import setPaymentMods from './set_payment_mods';
import setTicketMods from './set_ticket_mods';

const contractName = 'ModStore';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.projects = await this.deployMockLocalContractFn('Projects');
    this.operatorStore = await this.deployMockLocalContractFn('OperatorStore');
    this.terminalDirectory = await this.deployMockLocalContractFn('TerminalDirectory');
    this.modAllocator = await this.deployMockLocalContractFn('ExampleModAllocator');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [
      this.projects.address,
      this.operatorStore.address,
      this.terminalDirectory.address,
    ]);
  });

  // Test each function.
  describe('setPaymentMods(...)', setPaymentMods);
  describe('setTicketMods(...)', setTicketMods);
};
