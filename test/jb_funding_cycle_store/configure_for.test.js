import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { fastForward, getTimestamp, createFundingCycleData } from '../helpers/utils';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import ijbFundingCycleBallot from '../../artifacts/contracts/interfaces/IJBFundingCycleBallot.sol/IJBFundingCycleBallot.json';
import { Bytecode } from 'hardhat/internal/hardhat-network/stack-traces/model';
import { BigNumber } from 'ethers';

describe.only('JBFundingCycleStore::configureFor(...)', function () {
  const PROJECT_ID = 2;

  const EMPTY_FUNDING_CYCLE = {
    number: ethers.BigNumber.from(0),
    configuration: ethers.BigNumber.from(0),
    basedOn: ethers.BigNumber.from(0),
    start: ethers.BigNumber.from(0),
    duration: ethers.BigNumber.from(0),
    weight: ethers.BigNumber.from(0),
    discountRate: ethers.BigNumber.from(0),
    ballot: ethers.constants.AddressZero,
    metadata: ethers.BigNumber.from(0)
  };

  const ApprovedBallot = 0;
  const ActiveBallot = 1;
  const FailedBallot = 2;
  const StandbyBallot = 3;

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

  it("Should create current funding cycle and queued cycle on first configure", async function () {
    const { controller, mockJbDirectory, jbFundingCycleStore } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const fundingCycleData = createFundingCycleData();

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

    const expectedCurrentFundingCycle = {
      number: ethers.BigNumber.from(1),
      configuration: configurationTimestamp,
      basedOn: ethers.BigNumber.from(0),
      start: configurationTimestamp,
      duration: fundingCycleData.duration,
      weight: fundingCycleData.weight,
      discountRate: fundingCycleData.discountRate,
      ballot: fundingCycleData.ballot,
      metadata: fundingCycleMetadata
    };
    // The `get` call should return the correct funding cycle.
    expect(cleanFundingCycle(await jbFundingCycleStore.get(PROJECT_ID, configurationTimestamp))).to.eql(expectedCurrentFundingCycle);

    // The `currentOf` call should return the correct funding cycle.
    expect(cleanFundingCycle(await jbFundingCycleStore.currentOf(PROJECT_ID))).to.eql(expectedCurrentFundingCycle);

    // The `queuedOf` should contain the properties of the current cycle, with a new number and start.
    expect(cleanFundingCycle(await jbFundingCycleStore.queuedOf(PROJECT_ID))).to.eql({
      ...expectedCurrentFundingCycle,
      number: expectedCurrentFundingCycle.number.add(1), // next number
      start: expectedCurrentFundingCycle.start.add(expectedCurrentFundingCycle.duration) // starts at the end of the first cycle
    });
  });

  it("Should configure subsequent cycle during a funding cycle", async function () {
    const { controller, mockJbDirectory, jbFundingCycleStore, addrs } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const firstFundingCycleData = createFundingCycleData();

    // The metadata value doesn't affect the test.
    const firstFundingCycleMetadata = ethers.BigNumber.from(123);

    // Configure first funding cycle
    const firstConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, firstFundingCycleData, firstFundingCycleMetadata);

    // The timestamp the first configuration was made during.
    const firstConfigurationTimestamp = await getTimestamp(firstConfigureForTx.blockNumber);

    const expectedFirstFundingCycle = {
      number: ethers.BigNumber.from(1),
      configuration: firstConfigurationTimestamp,
      basedOn: ethers.BigNumber.from(0),
      start: firstConfigurationTimestamp,
      duration: firstFundingCycleData.duration,
      weight: firstFundingCycleData.weight,
      discountRate: firstFundingCycleData.discountRate,
      ballot: firstFundingCycleData.ballot,
      metadata: firstFundingCycleMetadata
    };

    const secondFundingCycleData = createFundingCycleData({ ballot: addrs[0].address, duration: firstFundingCycleData.duration.add(1), discountRate: firstFundingCycleData.discountRate.add(1), weight: firstFundingCycleData.weight.add(1) });

    // The metadata value doesn't affect the test.
    const secondFundingCycleMetadata = ethers.BigNumber.from(234);

    //fast forward to within the cycle.
    //keep 5 seconds before the end of the cycle so make all necessary checks before the cycle ends.
    await fastForward(firstConfigureForTx.blockNumber, ethers.BigNumber.from(firstFundingCycleData.duration - 5));

    // Configure first funding cycle
    const secondConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, secondFundingCycleData, secondFundingCycleMetadata);

    // The timestamp the second configuration was made during.
    const secondConfigurationTimestamp = await getTimestamp(secondConfigureForTx.blockNumber);

    const expectedSecondFundingCycle = {
      number: ethers.BigNumber.from(2), // second cycle
      configuration: secondConfigurationTimestamp,
      basedOn: firstConfigurationTimestamp, // based on the first cycle
      start: firstConfigurationTimestamp.add(firstFundingCycleData.duration), // starts at the end of the first cycle
      duration: secondFundingCycleData.duration,
      weight: secondFundingCycleData.weight,
      discountRate: secondFundingCycleData.discountRate,
      ballot: secondFundingCycleData.ballot,
      metadata: secondFundingCycleMetadata
    };

    // The `get` call should return the correct funding cycle.
    expect(cleanFundingCycle(await jbFundingCycleStore.get(PROJECT_ID, secondConfigurationTimestamp))).to.eql(expectedSecondFundingCycle);

    // The `currentOf` call should return the correct funding cycle.
    expect(cleanFundingCycle(await jbFundingCycleStore.currentOf(PROJECT_ID))).to.eql(expectedFirstFundingCycle);

    // The `queuedOf` should contain the properties of the current cycle, with a new number, start, and weight.
    expect(cleanFundingCycle(await jbFundingCycleStore.queuedOf(PROJECT_ID))).to.eql(expectedSecondFundingCycle);
  });

  it("Should configure subsequent cycle with a weight derived from previous cycle if a value of 0 is passed in", async function () {
    const { controller, mockJbDirectory, jbFundingCycleStore, addrs } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const firstFundingCycleData = createFundingCycleData();

    // The metadata value doesn't affect the test.
    const firstFundingCycleMetadata = ethers.BigNumber.from(123);

    // Configure first funding cycle
    const firstConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, firstFundingCycleData, firstFundingCycleMetadata);

    // The timestamp the first configuration was made during.
    const firstConfigurationTimestamp = await getTimestamp(firstConfigureForTx.blockNumber);

    // Set a weight of 0.
    const secondFundingCycleData = createFundingCycleData({ weight: ethers.BigNumber.from(0) });

    // The metadata value doesn't affect the test.
    const secondFundingCycleMetadata = ethers.BigNumber.from(234);

    //fast forward to within the cycle.
    //keep 5 seconds before the end of the cycle so make all necessary checks before the cycle ends.
    await fastForward(firstConfigureForTx.blockNumber, ethers.BigNumber.from(firstFundingCycleData.duration - 5));

    // Configure first funding cycle
    const secondConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, secondFundingCycleData, secondFundingCycleMetadata);

    // The timestamp the second configuration was made during.
    const secondConfigurationTimestamp = await getTimestamp(secondConfigureForTx.blockNumber);

    const expectedSecondFundingCycle = {
      number: ethers.BigNumber.from(2), // second cycle
      configuration: secondConfigurationTimestamp,
      basedOn: firstConfigurationTimestamp, // based on the first cycle
      start: firstConfigurationTimestamp.add(firstFundingCycleData.duration), // starts at the end of the first cycle
      duration: secondFundingCycleData.duration,
      weight: firstFundingCycleData.weight, // expect a weight derived from the previous cycle's values because 0 was sent. 
      discountRate: secondFundingCycleData.discountRate,
      ballot: secondFundingCycleData.ballot,
      metadata: secondFundingCycleMetadata
    };

    // The `queuedOf` should contain the properties of the current cycle, with a new number, start, and weight.
    expect(cleanFundingCycle(await jbFundingCycleStore.queuedOf(PROJECT_ID))).to.eql(expectedSecondFundingCycle);
  });

  it("Should configure subsequent cycle using a weight of 1 to represent 1", async function () {
    const { controller, mockJbDirectory, jbFundingCycleStore, addrs } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const firstFundingCycleData = createFundingCycleData();

    // The metadata value doesn't affect the test.
    const firstFundingCycleMetadata = ethers.BigNumber.from(123);

    // Configure first funding cycle
    const firstConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, firstFundingCycleData, firstFundingCycleMetadata);

    // The timestamp the first configuration was made during.
    const firstConfigurationTimestamp = await getTimestamp(firstConfigureForTx.blockNumber);

    // Set a weight of 1.
    const secondFundingCycleData = createFundingCycleData({ weight: ethers.BigNumber.from(1) });

    // The metadata value doesn't affect the test.
    const secondFundingCycleMetadata = ethers.BigNumber.from(234);

    //fast forward to within the cycle.
    //keep 5 seconds before the end of the cycle so make all necessary checks before the cycle ends.
    await fastForward(firstConfigureForTx.blockNumber, ethers.BigNumber.from(firstFundingCycleData.duration - 5));

    // Configure first funding cycle
    const secondConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, secondFundingCycleData, secondFundingCycleMetadata);

    // The timestamp the second configuration was made during.
    const secondConfigurationTimestamp = await getTimestamp(secondConfigureForTx.blockNumber);

    const expectedSecondFundingCycle = {
      number: ethers.BigNumber.from(2), // second cycle
      configuration: secondConfigurationTimestamp,
      basedOn: firstConfigurationTimestamp, // based on the first cycle
      start: firstConfigurationTimestamp.add(firstFundingCycleData.duration), // starts at the end of the first cycle
      duration: secondFundingCycleData.duration,
      weight: ethers.BigNumber.from(0), // expect 0 because 1 was sent. 
      discountRate: secondFundingCycleData.discountRate,
      ballot: secondFundingCycleData.ballot,
      metadata: secondFundingCycleMetadata
    };

    // The `queuedOf` should contain the properties of the current cycle, with a new number, start, and weight.
    expect(cleanFundingCycle(await jbFundingCycleStore.queuedOf(PROJECT_ID))).to.eql(expectedSecondFundingCycle);
  });

  it("Should apply a discount rate to subsequent cycle after reconfiguration with a weight derived from previous cycle if a value of 0 is passed in", async function () {
    const { controller, mockJbDirectory, jbFundingCycleStore, addrs } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const discountRate = 0.5; // 50% discount rate 
    const discountFidelity = 100000000; // Discout rate is stored out of this number.

    const firstFundingCycleData = createFundingCycleData({ discountRate: BigNumber.from(discountRate * discountFidelity) });

    // The metadata value doesn't affect the test.
    const firstFundingCycleMetadata = ethers.BigNumber.from(123);

    // Configure first funding cycle
    const firstConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, firstFundingCycleData, firstFundingCycleMetadata);

    // The timestamp the first configuration was made during.
    const firstConfigurationTimestamp = await getTimestamp(firstConfigureForTx.blockNumber);

    // Set a weight of 0.
    const secondFundingCycleData = createFundingCycleData({ weight: ethers.BigNumber.from(0) });

    // The metadata value doesn't affect the test.
    const secondFundingCycleMetadata = ethers.BigNumber.from(234);

    //fast forward to within the cycle.
    //keep 5 seconds before the end of the cycle so make all necessary checks before the cycle ends.
    await fastForward(firstConfigureForTx.blockNumber, ethers.BigNumber.from(firstFundingCycleData.duration - 5));

    // Configure first funding cycle
    const secondConfigureForTx = await jbFundingCycleStore
      .connect(controller)
      .configureFor(PROJECT_ID, secondFundingCycleData, secondFundingCycleMetadata);

    // The timestamp the second configuration was made during.
    const secondConfigurationTimestamp = await getTimestamp(secondConfigureForTx.blockNumber);

    const expectedSecondFundingCycle = {
      number: ethers.BigNumber.from(2), // second cycle
      configuration: secondConfigurationTimestamp,
      basedOn: firstConfigurationTimestamp, // based on the first cycle
      start: firstConfigurationTimestamp.add(firstFundingCycleData.duration), // starts at the end of the first cycle
      duration: secondFundingCycleData.duration,
      weight: firstFundingCycleData.weight.div(1 / discountRate), // expect a weight derived from the previous cycle's values because 0 was sent. 
      discountRate: secondFundingCycleData.discountRate,
      ballot: secondFundingCycleData.ballot,
      metadata: secondFundingCycleMetadata
    };

    // The `queuedOf` should contain the properties of the current cycle, with a new number, start, and weight.
    expect(cleanFundingCycle(await jbFundingCycleStore.queuedOf(PROJECT_ID))).to.eql(expectedSecondFundingCycle);
  });

  it("Should apply a discounr rate to a subsequent cycle that rolls over", async function () {
    const { controller, mockJbDirectory, jbFundingCycleStore, addrs } = await setup();
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const discountRate = 0.5; // Use a discount rate of 50%

    const discountRateFidelity = 100000000; // Discount rates are stored out of this number

    const fundingCycleData = createFundingCycleData({ discountRate: ethers.BigNumber.from(discountRateFidelity * discountRate) });

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

    const expectedCurrentFundingCycle = {
      number: ethers.BigNumber.from(1),
      configuration: configurationTimestamp,
      basedOn: ethers.BigNumber.from(0),
      start: configurationTimestamp,
      duration: fundingCycleData.duration,
      weight: fundingCycleData.weight,
      discountRate: fundingCycleData.discountRate,
      ballot: fundingCycleData.ballot,
      metadata: fundingCycleMetadata
    };
    // The `get` call should return the correct funding cycle.
    expect(cleanFundingCycle(await jbFundingCycleStore.get(PROJECT_ID, configurationTimestamp))).to.eql(expectedCurrentFundingCycle);

    // The `currentOf` call should return the correct funding cycle.
    expect(cleanFundingCycle(await jbFundingCycleStore.currentOf(PROJECT_ID))).to.eql(expectedCurrentFundingCycle);

    // The `queuedOf` should contain the properties of the current cycle, with a new number, start, and weight.
    expect(cleanFundingCycle(await jbFundingCycleStore.queuedOf(PROJECT_ID))).to.eql({
      ...expectedCurrentFundingCycle,
      number: expectedCurrentFundingCycle.number.add(1), // next number
      start: expectedCurrentFundingCycle.start.add(expectedCurrentFundingCycle.duration), // starts at the end of the first cycle
      weight: expectedCurrentFundingCycle.weight.div(1 / discountRate) // apply the discount rate
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
