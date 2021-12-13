import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import ijbFundingCycleBallot from '../../artifacts/contracts/interfaces/IJBFundingCycleBallot.sol/IJBFundingCycleBallot.json';
import { createFundingCycleData } from './utils';
import { BigNumber } from '@ethersproject/bignumber';

describe('JBFundingCycleStore::configureFor(...)', function () {
  const PROJECT_ID = 2;

  async function setup() {
    const [deployer, controller, ...addrs] = await ethers.getSigners();

    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockBallot = await deployMockContract(deployer, ijbFundingCycleBallot.abi);
    const jbFundingCycleStoreFactory = await ethers.getContractFactory('JBFundingCycleStore');
    const jbFundingCycleStore = await jbFundingCycleStoreFactory
      .connect(deployer)
      .deploy(mockJbDirectory.address);
    return {
      controller,
      mockJbDirectory,
      mockBallot,
      jbFundingCycleStore,
      addrs,
    };
  }

  /* Sad path testing */

  it("Should fail if caller is not project's controller", async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore, addrs } = await setup();
    const [nonController] = addrs;
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({ ballot: mockBallot.address });

    await expect(
      jbFundingCycleStore.connect(nonController).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x4f: UNAUTHORIZED');
  });

  it('Should fail if funding cycle duration is shorter than 1000 seconds', async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({ duration: 999, ballot: mockBallot.address });

    await expect(
      jbFundingCycleStore.connect(controller).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x15: BAD_DURATION');
  });

  it('Should fail if discount rate is above 100%', async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({
      discountRate: 1000000002,
      ballot: mockBallot.address,
    });

    await expect(
      jbFundingCycleStore.connect(controller).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x16: BAD_DISCOUNT_RATE');
  });

  it('Should fail for weight larger than uint88_max', async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const badWeight = BigNumber.from('1').shl(88);

    const fundingCycleData = createFundingCycleData({
      weight: badWeight,
      ballot: mockBallot.address,
    });

    await expect(
      jbFundingCycleStore.connect(controller).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x18: BAD_WEIGHT');
  });
});
