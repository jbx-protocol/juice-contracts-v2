import { expect } from 'chai';
import hardhat from 'hardhat';

import { deployMockLocalContract, getAddresses, getDeployer } from '../../../helpers/utils';

const {
  ethers: { constants },
} = hardhat;

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'takes fee',
      fn: () => ({
        caller: deployer,
        beneficiary: addrs[0].address,
        memo: 'some-memo',
        preferUnstakedTickets: true,
      }),
    },
  ],
  failure: [
    {
      description: 'zero project',
      fn: () => ({
        caller: deployer,
        beneficiary: addrs[0].address,
        memo: 'some-memo',
        preferUnstakedTickets: true,
        setup: { setTerminal: false, zeroProject: true },
        revert: 'JuiceboxProject::takeFee: PROJECT_NOT_FOUND',
      }),
    },
    {
      description: 'zero terminal',
      fn: () => ({
        caller: deployer,
        beneficiary: addrs[0].address,
        memo: 'some-memo',
        preferUnstakedTickets: true,
        setup: { setTerminal: false },
        revert: 'JuiceboxProject::takeFee: TERMINAL_NOT_FOUND',
      }),
    },
    {
      description: 'insufficient funds',
      fn: () => ({
        caller: deployer,
        beneficiary: addrs[0].address,
        memo: 'some-memo',
        preferUnstakedTickets: true,
        setup: { setTerminal: true },
        revert: 'JuiceboxProject::takeFee: INSUFFICIENT_FUNDS',
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
        const { caller, beneficiary, memo, preferUnstakedTickets } = successTest.fn(this);

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

        await this.terminalDirectory.mock.terminalOf
          .withArgs(this.projectId)
          .returns(terminalV1.address);

        await terminalV1.mock.pay
          .withArgs(this.projectId, beneficiary, memo, preferUnstakedTickets)
          .returns(0);

        const value = 1234;
        await caller.sendTransaction({
          to: this.contract.address,
          value,
        });

        // Execute the transaction.
        await this.contract
          .connect(caller)
          .takeFee(value, beneficiary, memo, preferUnstakedTickets);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const {
          caller,
          beneficiary,
          memo,
          preferUnstakedTickets,
          setup: { setTerminal = true, zeroProject = false } = {},
          revert,
        } = failureTest.fn(this);

        if (setTerminal) {
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

          await this.terminalDirectory.mock.terminalOf
            .withArgs(this.projectId)
            .returns(terminalV1.address);
          await terminalV1.mock.pay
            .withArgs(this.projectId, beneficiary, memo, preferUnstakedTickets)
            .returns(0);
        } else {
          await this.terminalDirectory.mock.terminalOf
            .withArgs(this.projectId)
            .returns(constants.AddressZero);
        }

        if (zeroProject) {
          await this.contract.connect(caller).setProjectId(0);
        }

        // Execute the transaction.
        await expect(
          this.contract.connect(caller).takeFee(1234, beneficiary, memo, preferUnstakedTickets),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
