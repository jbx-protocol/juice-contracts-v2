import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { getTimestamp, createFundingCycleData } from '../helpers/utils';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import ijbFundingCycleBallot from '../../artifacts/contracts/interfaces/IJBFundingCycleBallot.sol/IJBFundingCycleBallot.json';

describe.only('JBFundingCycleStore::configureFor(...)', function () {
  const PROJECT_ID = 2;

  async function setup() {
    const [deployer, controller, ...addrs] = await ethers.getSigners();

    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockBallot = await deployMockContract(deployer, ijbFundingCycleBallot.abi);

    const jbFundingCycleStoreFactory = await ethers.getContractFactory('JBFundingCycleStore');
    const jbFundingCycleStore = await jbFundingCycleStoreFactory.deploy(mockJbDirectory.address);

    return {
      controller,
      mockJbDirectory,
      jbFundingCycleStore,
      mockBallot,
      addrs
    };
  }

  const cleanFundingCycle = (fc) => ({
    number: fc[0],
    configuration: fc[1],
    basedOn: fc[2],
    start: fc[3],
    duration: fc[4],
    weight: fc[5],
    discountRate: fc[6],
    ballot: fc[7],
    metadata: fc[8]
  });

  it("Should create current funding cycle", async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({ ballot: mockBallot.address });

    // The metadata value doesn't affect the test.
    const fundingCycleMetadata = ethers.BigNumber.from(123);

    // Configure funding cycle
    const configureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, fundingCycleData, fundingCycleMetadata);

    // The timestamp the configuration was made during.
    const configurationTimestamp = await getTimestamp(configureForTx.blockNumber);

    await expect(configureForTx)
      .to.emit(jbFundingCycleStore, 'Configure')
      .withArgs(configurationTimestamp, PROJECT_ID, [fundingCycleData.duration, fundingCycleData.weight, fundingCycleData.discountRate, fundingCycleData.ballot], fundingCycleMetadata, controller.address);

    expect(cleanFundingCycle(await jbFundingCycleStore.get(PROJECT_ID, configurationTimestamp))).to.eql({
      number: ethers.BigNumber.from(1),
      configuration: configurationTimestamp,
      basedOn: ethers.BigNumber.from(0),
      start: configurationTimestamp,
      duration: fundingCycleData.duration,
      weight: fundingCycleData.weight,
      discountRate: fundingCycleData.discountRate,
      ballot: fundingCycleData.ballot,
      metadata: fundingCycleMetadata
    });
  });

  it("Can't configure if caller is not project's controller", async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore, addrs } = await setup();
    const [nonController] = addrs;
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({ ballot: mockBallot.address });

    await expect(
      jbFundingCycleStore.connect(nonController).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x4f: UNAUTHORIZED');
  });

  it(`Can't configure if funding cycle duration is shorter than 1000 seconds`, async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({ duration: 999, ballot: mockBallot.address });

    await expect(
      jbFundingCycleStore.connect(controller).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x15: BAD_DURATION');
  });

  it(`Can't configure if funding cycle discount rate is above 100%`, async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData({
      discountRate: 1000000001,
      ballot: mockBallot.address,
    });

    await expect(
      jbFundingCycleStore.connect(controller).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x16: BAD_DISCOUNT_RATE');
  });

  it(`Can't configure if funding cycle weight larger than uint88_max`, async function () {
    const { controller, mockJbDirectory, mockBallot, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const badWeight = ethers.BigNumber.from('1').shl(88);

    const fundingCycleData = createFundingCycleData({
      weight: badWeight,
      ballot: mockBallot.address,
    });

    await expect(
      jbFundingCycleStore.connect(controller).configureFor(PROJECT_ID, fundingCycleData, 0),
    ).to.be.revertedWith('0x18: BAD_WEIGHT');
  });
});
