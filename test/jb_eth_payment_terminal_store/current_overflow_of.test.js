import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBETHPaymentTerminalStore::currentOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');

  async function setup() {
    const [deployer, terminal] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, jbController.abi);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();
    const CURRENCY_USD = await jbCurrencies.USD();

    const jbEthPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'JBETHPaymentTerminalStore',
    );
    const jbEthPaymentTerminalStore = await jbEthPaymentTerminalStoreFactory.deploy(
      mockJbPrices.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
    );

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    return {
      terminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should return the current overflowed amount', async function () {
    const {
      terminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(AMOUNT);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH)
      .returns(ethers.FixedNumber.from(1));

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mulUnsafe(ethers.FixedNumber.from(2));
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Get current overflow
    expect(await jbEthPaymentTerminalStore.currentOverflowOf(PROJECT_ID)).to.equal(AMOUNT);
  });

  it('Should return 0 overflow if ETH balance < distribution remaining', async function () {
    const {
      terminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(AMOUNT);

    // Get current overflow
    expect(await jbEthPaymentTerminalStore.currentOverflowOf(PROJECT_ID)).to.equal(0);
  });

  it('Should return 0 overflow if ETH balance is 0', async function () {
    const { mockJbFundingCycleStore, jbEthPaymentTerminalStore, timestamp } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    });

    // Get current overflow
    expect(await jbEthPaymentTerminalStore.currentOverflowOf(PROJECT_ID)).to.equal(0);
  });
});
