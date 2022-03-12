import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata, impersonateAccount } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbFundingCycleDataSource from '../../artifacts/contracts/interfaces/IJBFundingCycleDataSource.sol/IJBFundingCycleDataSource.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBPaymentTerminalStore::recordPaymentFrom(...)', function () {
  const PROJECT_ID = 2;

  const AMOUNT = ethers.BigNumber.from('4398541').mul(ethers.BigNumber.from(10).pow(18));
  const WEIGHT = ethers.BigNumber.from('90000').mul(ethers.BigNumber.from(10).pow(18));

  const CURRENCY = 1;
  const BASE_CURRENCY = 1;

  async function setup() {
    const [deployer, payer, beneficiary, ...addrs] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbFundingCycleDataSource = await deployMockContract(
      deployer,
      jbFundingCycleDataSource.abi,
    );
    const mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, jbController.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

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

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    /* Common mocks */

    await mockJbTerminal.mock.currency.returns(CURRENCY);
    await mockJbTerminal.mock.baseWeightCurrency.returns(BASE_CURRENCY);

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    return {
      mockJbTerminal,
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbController,
      mockJbPrices,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbPrices,
      JBPaymentTerminalStore,
      timestamp,
      addrs
    };
  }

  /* Happy path tests with mockJbTerminal access */

  it('Should record payment without a datasource', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      JBPaymentTerminalStore,
      timestamp,
    } = await setup();

    const reservedRate = 0;

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    // Record the payment
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordPaymentFrom(
        /* payer */ payer.address,
        AMOUNT,
        PROJECT_ID,
        beneficiary.address,
        /* memo */ 'test'
      );

    // Expect recorded balance to change
    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(AMOUNT);
  });
  it('Should record payment with no weight', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      JBPaymentTerminalStore,
      timestamp,
    } = await setup();

    const reservedRate = 0;

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    // Record the payment
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordPaymentFrom(
        /* payer */ payer.address,
        AMOUNT,
        PROJECT_ID,
        beneficiary.address,
        /* memo */ 'test'
      );

    // Expect recorded balance to change
    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(AMOUNT);
  });


  it('Should record payment with a datasource and emit event', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      JBPaymentTerminalStore,
      timestamp,
      addrs
    } = await setup();

    const memo = 'test';
    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pausePay: 0,
      reservedRate: reservedRate,
      useDataSourceForPay: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // JBFundingCycle obj
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

    const newMemo = 'new memo';
    const delegate = addrs[0];

    await mockJbFundingCycleDataSource.mock.payParams
      .withArgs({
        // JBPayParamsData obj
        terminal: mockJbTerminalSigner.address,
        payer: payer.address,
        amount: AMOUNT,
        projectId: PROJECT_ID,
        weight: WEIGHT,
        reservedRate: reservedRate,
        beneficiary: beneficiary.address,
        memo: memo
      })
      .returns(WEIGHT, newMemo, delegate.address);

    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    // Record the payment
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordPaymentFrom(
        /* payer */ payer.address,
        /* amount */ AMOUNT,
        /* projectId */ PROJECT_ID,
        beneficiary.address,
        /* memo */ memo
      );

    // Expect recorded balance to change
    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(AMOUNT);
  });

  it('Should record payment without a weight', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      JBPaymentTerminalStore,
      timestamp,
    } = await setup();

    const reservedRate = 0;

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    // Record the payment
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordPaymentFrom(
        /* payer */ payer.address,
        AMOUNT,
        PROJECT_ID,
        beneficiary.address,
        /* memo */ 'test'
      );

    // Expect recorded balance to change
    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(AMOUNT);
  });

  it('Should record payment with a base weight currency that differs from the terminal currency', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      JBPaymentTerminalStore,
      mockJbTerminal,
      mockJbPrices,
      timestamp,
    } = await setup();


    const reservedRate = 0;
    const otherBaseCurrency = 2;
    const conversionPrice = ethers.BigNumber.from(2);
    await mockJbTerminal.mock.baseWeightCurrency.returns(otherBaseCurrency);

    await mockJbPrices.mock.priceFor.withArgs(CURRENCY, otherBaseCurrency).returns(conversionPrice.mul(ethers.BigNumber.from(10).pow(18)));

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    // Record the payment
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordPaymentFrom(
        /* payer */ payer.address,
        AMOUNT,
        PROJECT_ID,
        beneficiary.address,
        /* memo */ 'test'
      );

    // Expect recorded balance to change
    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(AMOUNT);
  });

  it(`Should skip minting and recording payment if amount is 0`, async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      JBPaymentTerminalStore,
      timestamp,
      addrs
    } = await setup();

    const memo = 'test';
    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pausePay: 0,
      reservedRate: reservedRate,
      useDataSourceForPay: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // JBFundingCycle obj
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

    const newMemo = 'new memo';
    const delegate = addrs[0];
    await mockJbFundingCycleDataSource.mock.payParams
      .withArgs({
        // JBPayParamsData obj
        terminal: mockJbTerminalSigner.address,
        payer: payer.address,
        amount: 0,
        projectId: PROJECT_ID,
        weight: WEIGHT,
        reservedRate: reservedRate,
        beneficiary: beneficiary.address,
        memo: memo
      })
      .returns(WEIGHT, newMemo, delegate.address);

    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    // Record the payment
    const tx = await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner).callStatic
      .recordPaymentFrom(
        /* payer */ payer.address,
        /* amount */ 0,
        /* projectId */ PROJECT_ID,
        beneficiary.address,
        /* memo */ memo
      );

    // Recorded balance should not have changed
    expect(await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID)).to.equal(0);

    expect(tx.delegate).to.equal(delegate.address);
  });

  /* Sad path tests */

  it(`Can't record payment if fundingCycle hasn't been configured`, async function () {
    const { mockJbTerminalSigner, payer, beneficiary, mockJbFundingCycleStore, JBPaymentTerminalStore } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // empty JBFundingCycle obj
      number: 0, // Set bad number
      configuration: 0,
      basedOn: 0,
      start: 0,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: 0,
    });

    // Record the payment
    await expect(
      JBPaymentTerminalStore
        .connect(mockJbTerminalSigner)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          beneficiary.address,
          /* memo */ 'test'
        ),
    ).to.be.revertedWith(errors.INVALID_FUNDING_CYCLE);
  });

  it(`Can't record payment if fundingCycle has been paused`, async function () {
    const { mockJbTerminalSigner, payer, beneficiary, mockJbFundingCycleStore, JBPaymentTerminalStore } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: 0,
      basedOn: 0,
      start: 0,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 1 }), // Payments paused
    });

    // Record the payment
    await expect(
      JBPaymentTerminalStore
        .connect(mockJbTerminalSigner)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          beneficiary.address,
          /* memo */ 'test'
        ),
    ).to.be.revertedWith(errors.FUNDING_CYCLE_PAYMENT_PAUSED);
  });
});
