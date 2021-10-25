import { deployMockLocalContract } from '../../../utils';

import deployProxyPaymentAddress from './deploy_proxy_payment_address';

const contractName = 'ProxyPaymentAddressManager';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.terminalDirectory = await deployMockLocalContract('TerminalDirectory');
    this.ticketBooth = await deployMockLocalContract('TicketBooth');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [
      this.terminalDirectory.address,
      this.ticketBooth.address,
    ]);
  });

  // Test each function.
  describe('deploy_proxy_payment_address(...)', deployProxyPaymentAddress);
}
