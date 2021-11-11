import { expect } from 'chai';

import { deployMockLocalContract, getAddresses, getDeployer } from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'appoints governance',
      fn: () => ({
        caller: deployer,
        newGovernance: addrs[0].address,
      }),
    },
  ],
  failure: [
    {
      description: 'unauthorized',
      fn: () => ({
        caller: addrs[0].address,
        newGovernance: addrs[0].address,
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
        const { caller, newGovernance } = successTest.fn(this);

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

        await terminalV1.mock.appointGovernance.withArgs(newGovernance).returns();

        // Execute the transaction.
        await this.contract.connect(caller).appointGovernance(terminalV1.address, newGovernance);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, newGovernance, revert } = failureTest.fn(this);

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

        // Execute the transaction.
        await expect(
          this.contract.connect(caller).appointGovernance(terminalV1.address, newGovernance),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
