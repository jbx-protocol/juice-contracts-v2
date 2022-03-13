import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata, impersonateAccount } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPaymentTerminal.sol/IJBPaymentTerminal.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JB18DecimalPaymentTerminalStore::recordDistributionFor(...)', function () {
  const FUNDING_CYCLE_NUM = 1;
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');
  const CURRENCY = 1;

  let decimals;

  async function setup() {
    const [deployer, addr] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, jbController.abi);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();
    const CURRENCY_USD = await jbCurrencies.USD();

    const JB18DecimalPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'JB18DecimalPaymentTerminalStore',
    );
    const JB18DecimalPaymentTerminalStore = await JB18DecimalPaymentTerminalStoreFactory.deploy(
      mockJbPrices.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
    );

    decimals = await JB18DecimalPaymentTerminalStore.TARGET_DECIMALS();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    /* Common mocks */

    await mockJbTerminal.mock.currency.returns(CURRENCY);

    // Set controller address
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    return {
      mockJbTerminal,
      mockJbTerminalSigner,
      addr,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should record distribution with mockJbTerminal access', async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    const usdToEthPrice = ethers.FixedNumber.from(10000);
    const amountInWei = AMOUNT.divUnsafe(usdToEthPrice);

    // Add to balance beforehand
    await JB18DecimalPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordAddedBalanceFor(PROJECT_ID, amountInWei);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbPrices.mock.priceFor.withArgs(CURRENCY_USD, CURRENCY_ETH, decimals).returns(usdToEthPrice);

    // Pre-checks
    expect(
      await JB18DecimalPaymentTerminalStore.usedDistributionLimitOf(mockJbTerminalSigner.address, PROJECT_ID, FUNDING_CYCLE_NUM),
    ).to.equal(0);
    expect(await JB18DecimalPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(amountInWei);

    // Record the distributions
    await JB18DecimalPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordDistributionFor(PROJECT_ID, AMOUNT, CURRENCY_USD);

    // Post-checks
    expect(
      await JB18DecimalPaymentTerminalStore.usedDistributionLimitOf(mockJbTerminalSigner.address, PROJECT_ID, FUNDING_CYCLE_NUM),
    ).to.equal(AMOUNT);
    expect(await JB18DecimalPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);
  });

  /* Sad path tests */

  it(`Can't record distribution if distributions are paused`, async function () {
    const {
      mockJbTerminalSigner,
      mockJbFundingCycleStore,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 1 }),
    });

    // Record the distributions
    await expect(
      JB18DecimalPaymentTerminalStore
        .connect(mockJbTerminalSigner)
        .recordDistributionFor(PROJECT_ID, AMOUNT, CURRENCY_ETH),
    ).to.be.revertedWith(errors.FUNDING_CYCLE_DISTRIBUTION_PAUSED);
  });

  it(`Can't record distribution if currency param doesn't match controller's currency`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    // Record the distributions
    await expect(
      JB18DecimalPaymentTerminalStore
        .connect(mockJbTerminalSigner)
        .recordDistributionFor(PROJECT_ID, AMOUNT, CURRENCY_ETH), // Use ETH instead of expected USD
    ).to.be.revertedWith(errors.CURRENCY_MISMATCH);
  });

  it(`Can't record distribution if distributionLimit is exceeded`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    // Add to balance beforehand
    await JB18DecimalPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(PROJECT_ID, AMOUNT);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    const smallDistributionLimit = AMOUNT.subUnsafe(ethers.FixedNumber.from(1));
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(smallDistributionLimit); // Set intentionally small distribution limit

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_ETH, decimals)
      .returns(ethers.FixedNumber.from(1));

    // Record the distributions
    await expect(
      JB18DecimalPaymentTerminalStore
        .connect(mockJbTerminalSigner)
        .recordDistributionFor(PROJECT_ID, AMOUNT, CURRENCY_ETH),
    ).to.be.revertedWith(errors.DISTRIBUTION_AMOUNT_LIMIT_REACHED);
  });

  it(`Can't record distribution if distributedAmount > project's total balance`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    // Add intentionally small balance
    const smallBalance = AMOUNT.subUnsafe(ethers.FixedNumber.from(1));
    await JB18DecimalPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordAddedBalanceFor(PROJECT_ID, smallBalance);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_ETH, decimals)
      .returns(ethers.FixedNumber.from(1));

    // Record the distributions
    await expect(
      JB18DecimalPaymentTerminalStore
        .connect(mockJbTerminalSigner)
        .recordDistributionFor(PROJECT_ID, AMOUNT, CURRENCY_ETH),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
});
