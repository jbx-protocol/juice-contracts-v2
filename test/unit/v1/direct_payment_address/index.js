import { deployContract, deployMockLocalContract } from '../../../utils';

import receive from './receive';

const contractName = 'DirectPaymentAddress';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.terminalV1 = await deployMockLocalContract('TerminalV1');
    this.terminalDirectory = await deployMockLocalContract('TerminalDirectory');
    this.projectId = 1;
    this.memo = 'some-memo';

    // Deploy the contract.
    this.contract = await deployContract(contractName, [
      this.terminalDirectory.address,
      this.projectId,
      this.memo,
    ]);
  });

  // Test each function.
  describe('receiver(...)', receive);
}
