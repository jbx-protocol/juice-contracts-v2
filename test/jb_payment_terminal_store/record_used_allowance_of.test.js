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

describe('JBPaymentTerminalStore::recordUsedAllowanceOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.BigNumber.from('43985411231');
  const WEIGHT = ethers.BigNumber.from('900000000');
  const _FIXED_POINT_MAX_FIDELITY = 18;

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

    const JBPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'JBPaymentTerminalStore',
    );
    const JBPaymentTerminalStore = await JBPaymentTerminalStoreFactory.deploy(
      mockJbPrices.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
    );

    _FIXED_POINT_MAX_FIDELITY = await JBPaymentTerminalStore.targetDecimals();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    /* Common mocks */

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);
    await mockJbTerminal.mock.baseWeightCurrency.returns(CURRENCY_ETH);

    // Set controller address
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

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    return {
      addr,
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should record used allowance with terminal access', async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const usdToEthPrice = ethers.BigNumber.from(3500);

    // Add to balance beforehand, in USD
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(0);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    // Pre-checks
    expect(
      await JBPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(0);
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT); // balanceOf is in terminal currency (USD)

    // Record the used allowance
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
      PROJECT_ID,
      AMOUNT,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await JBPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(AMOUNT);
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0); // AMOUNT-AMOUNT = 0
  });
  it('Should record used allowance with > 0 distribution limit', async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const usdToEthPrice = ethers.BigNumber.from(3500);

    // Add to balance beforehand, in USD
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    const distributionLimit = AMOUNT - 1;

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(distributionLimit);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    // Pre-checks
    expect(
      await JBPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(0);
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT); // balanceOf is in terminal currency (USD)

    // Record the used allowance
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
      PROJECT_ID,
      AMOUNT - distributionLimit,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await JBPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(AMOUNT - distributionLimit);
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(distributionLimit);
  });
  it('Should record used allowance with > 0 distribution limit and different distribution currency', async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const ethToUsdPrice = ethers.BigNumber.from(2).mul(ethers.BigNumber.from(10).pow(18));

    const distributionLimit = ethers.BigNumber.from(10).pow(18);

    const amountToUse = 1;

    // Add to balance beforehand, in USD
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      distributionLimit.add(amountToUse),
    );

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(distributionLimit);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(amountToUse);

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_USD, _FIXED_POINT_MAX_FIDELITY)
      .returns(ethToUsdPrice);

    // Pre-checks
    expect(
      await JBPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(0);
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(distributionLimit.add(amountToUse)); // balanceOf is in terminal currency (USD)

    // Record the used allowance
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
      PROJECT_ID,
      amountToUse,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await JBPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(amountToUse);
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(distributionLimit);
  });

  /* Sad path tests */

  it(`Can't record allowance if currency param doesn't match controller's currency`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    // Record the used allowance
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.CURRENCY_MISMATCH);
  });

  it(`Can't record allowance if controller's overflowAllowanceOf is exceeded`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_USD,
    } = await setup();

    // Add to balance beforehand
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    const smallTotalAllowance = AMOUNT.sub(ethers.BigNumber.from(1));
    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(smallTotalAllowance); // Set the controller's overflowAllowance to something small

    // Record the used allowance
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_CONTROLLER_ALLOWANCE);
  });

  it(`Can't record allowance if _leftToDistribute > balanceOf`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_USD,
    } = await setup();

    // Create a big overflow
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    // Note: We didn't add an initial balance to the store
    // Record the used allowance
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });

  it(`Can't record allowance if withdrawnAmount > overflow`, async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    // Add to balance beforehand
    const smallBalance = AMOUNT.sub(ethers.BigNumber.from(1));

    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    // Leave a small overflow
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(smallBalance);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_USD, _FIXED_POINT_MAX_FIDELITY)
      .returns(ethers.BigNumber.from(1));

    // Record the used allowance
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
  it(`Can't record used allowance with > 0 distribution limit and not enough balance outside of this limit`, async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const usdToEthPrice = ethers.BigNumber.from(3500);

    // Add to balance beforehand, in USD
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    const distributionLimit = AMOUNT;

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(distributionLimit);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbController.mock.overflowAllowanceCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_USD);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH, _FIXED_POINT_MAX_FIDELITY)
      .returns(usdToEthPrice);

    // Record the used allowance
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
});
