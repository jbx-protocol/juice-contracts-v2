import { expect } from 'chai';

import { deployMockLocalContract, getAddresses, getDeployer } from '../../../utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'sets fee',
      fn: () => ({
        caller: deployer,
      }),
    },
  ],
  failure: [
    {
      description: 'unauthorized',
      fn: () => ({
        caller: addrs[0].address,
        revert: 'Ownable: caller is not the owner',
      }),
    },
  ],
};

export default function () {
  before(async function () {
    deployer = await getDeployer();
    addrs = await getAddresses();
  });

  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        const { caller } = successTest.fn(this);

        const operatorStore = await deployMockLocalContract('OperatorStore');
        const projects = await deployMockLocalContract('Projects', [operatorStore.address]);
        const prices = await deployMockLocalContract('Prices');
        const terminalDirectory = await deployMockLocalContract('TerminalDirectory', [
          projects.address,
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

        // Deploy mock dependency contracts.
        const terminalV1 = await deployMockLocalContract('TerminalV1', [
          projects.address,
          fundingCycles.address,
          ticketBooth.address,
          operatorStore.address,
          modStore.address,
          prices.address,
          terminalDirectory.address,
        ]);
        const fee = 1;

        await terminalV1.mock.setFee.withArgs(fee).returns();

        // Execute the transaction.
        await this.contract.connect(caller).setFee(terminalV1.address, fee);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, revert } = failureTest.fn(this);

        const operatorStore = await deployMockLocalContract('OperatorStore');
        const projects = await deployMockLocalContract('Projects', [operatorStore.address]);
        const prices = await deployMockLocalContract('Prices');
        const terminalDirectory = await deployMockLocalContract('TerminalDirectory', [
          projects.address,
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

        // Deploy mock dependency contracts.
        const terminalV1 = await deployMockLocalContract('TerminalV1', [
          projects.address,
          fundingCycles.address,
          ticketBooth.address,
          operatorStore.address,
          modStore.address,
          prices.address,
          terminalDirectory.address,
        ]);
        const fee = 1;

        // Execute the transaction.
        await expect(
          this.contract.connect(caller).setFee(terminalV1.address, fee),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
