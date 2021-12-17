import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbFundingCycleDataSource from '../../artifacts/contracts/interfaces/IJBFundingCycleDataSource.sol/IJBFundingCycleDataSource.json';
import jbPayDelegate from '../../artifacts/contracts/interfaces/IJBPayDelegate.sol/IJBPayDelegate.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBETHPaymentTerminalStore::recordUsedAllowanceOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');

  async function setup() {
    const [deployer, terminal, addr] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbFundingCycleDataSource = await deployMockContract(
      deployer,
      jbFundingCycleDataSource.abi,
    );
    const mockJbPayDelegate = await deployMockContract(deployer, jbPayDelegate.abi);
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

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    const packedMetadata = packFundingCycleMetadata();
    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packedMetadata,
    });

    return {
      terminal,
      addr,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbPayDelegate,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should record used allowance with terminal access', async function () {
    const {
      terminal,
      mockJbController,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    const usdToEthPrice = ethers.FixedNumber.from(10000);
    const amountInWei = AMOUNT.divUnsafe(usdToEthPrice);

    // Add to balance beforehand
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, amountInWei);

    await mockJbController.mock.currencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(AMOUNT);

    await mockJbPrices.mock.priceFor.withArgs(CURRENCY_USD, CURRENCY_ETH).returns(usdToEthPrice);

    // Pre-checks
    expect(await jbEthPaymentTerminalStore.usedOverflowAllowanceOf(PROJECT_ID, timestamp)).to.equal(
      0,
    );
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(amountInWei);

    // Record the used allowance
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordUsedAllowanceOf(PROJECT_ID, AMOUNT, CURRENCY_USD, /* minReturnedWei */ amountInWei);

    // Post-checks
    expect(await jbEthPaymentTerminalStore.usedOverflowAllowanceOf(PROJECT_ID, timestamp)).to.equal(
      AMOUNT,
    );
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(0);
  });

  /* Sad path tests */

  it(`Can't record allowance without terminal access`, async function () {
    const { addr, jbEthPaymentTerminalStore, CURRENCY_ETH } = await setup();

    // Record the used allowance
    await expect(
      jbEthPaymentTerminalStore
        .connect(addr)
        .recordUsedAllowanceOf(PROJECT_ID, AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT),
    ).to.be.revertedWith('0x3a: UNAUTHORIZED');
  });

  it(`Can't record allowance if withdrawnAmount < minReturnedWei`, async function () {
    const {
      terminal,
      mockJbController,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    // Add to balance beforehand
    await jbEthPaymentTerminalStore.connect(terminal).recordAddedBalanceFor(PROJECT_ID, AMOUNT);

    await mockJbController.mock.currencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(AMOUNT);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_ETH)
      .returns(ethers.FixedNumber.from(1));

    // Record the used allowance
    const minReturnedWei = AMOUNT.addUnsafe(ethers.FixedNumber.from(1));
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordUsedAllowanceOf(
          PROJECT_ID,
          AMOUNT,
          CURRENCY_ETH,
          /* minReturnedWei */ minReturnedWei,
        ),
    ).to.be.revertedWith('0x45: INADEQUATE');
  });

  it(`Can't record allowance if withdrawnAmount > project's total balance`, async function () {
    const {
      terminal,
      mockJbController,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    // Add to balance beforehand
    const smallBalance = AMOUNT.subUnsafe(ethers.FixedNumber.from(1));
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, smallBalance);

    await mockJbController.mock.currencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(AMOUNT);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_ETH)
      .returns(ethers.FixedNumber.from(1));

    // Record the used allowance
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordUsedAllowanceOf(PROJECT_ID, AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT),
    ).to.be.revertedWith('0x44: INSUFFICIENT_FUNDS');
  });

  it(`Can't record allowance if overflowAllowanceOf is exceeded`, async function () {
    const {
      terminal,
      mockJbController,
      mockJbPrices,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    // Add to balance beforehand
    await jbEthPaymentTerminalStore.connect(terminal).recordAddedBalanceFor(PROJECT_ID, AMOUNT);

    await mockJbController.mock.currencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_ETH);

    const smallTotalAllowance = AMOUNT.subUnsafe(ethers.FixedNumber.from(1));
    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(smallTotalAllowance);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_ETH)
      .returns(ethers.FixedNumber.from(1));

    // Record the used allowance
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordUsedAllowanceOf(PROJECT_ID, AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT),
    ).to.be.revertedWith('0x43: NOT_ALLOWED');
  });

  it(`Can't record allowance if currency param doesn't match controller's currency`, async function () {
    const {
      terminal,
      mockJbController,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbController.mock.currencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_USD);

    // Record the used allowance
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordUsedAllowanceOf(PROJECT_ID, AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT),
    ).to.be.revertedWith('0x42: UNEXPECTED_CURRENCY');
  });
});
