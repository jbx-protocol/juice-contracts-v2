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

describe('JBETHPaymentTerminalStore::recordPaymentFrom(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');
  const WEIGHTED_AMOUNT = WEIGHT.mulUnsafe(AMOUNT);

  async function setup() {
    const [deployer, terminal, payer, beneficiary] = await ethers.getSigners();

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

    return {
      terminal,
      payer,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbPayDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
    };
  }

  /* Happy path tests with terminal access */

  it('Should record payment without a datasource', async function () {
    const {
      terminal,
      payer,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      jbEthPaymentTerminalStore,
      timestamp,
    } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate });

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
      metadata: packedMetadata,
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        WEIGHTED_AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'ETH received',
        /* preferClaimedTokens */ false,
        /* reservedRate */ reservedRate,
      )
      .returns(WEIGHTED_AMOUNT);

    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(0);

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordPaymentFrom(
        /* payer */ payer.address,
        AMOUNT,
        PROJECT_ID,
        /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
        /* minReturnedTokens */ 0,
        /* memo */ 'test',
        /* delegateMetadata */ 0,
      );

    // Expect recorded balance to change
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(AMOUNT);
  });

  it('Should record payment with a datasource and emit event', async function () {
    const {
      terminal,
      payer,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbPayDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
    } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

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

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    const delegateMetadata = [0];
    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.payParams
      .withArgs({
        // JBPayParamsData obj
        payer: payer.address,
        amount: AMOUNT,
        weight: WEIGHT,
        reservedRate: reservedRate,
        beneficiary: beneficiary.address,
        memo: memo,
        delegateMetadata: delegateMetadata,
      })
      .returns(WEIGHT, newMemo, mockJbPayDelegate.address, delegateMetadata);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        WEIGHTED_AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'ETH received',
        /* preferClaimedTokens */ false,
        /* reservedRate */ reservedRate,
      )
      .returns(WEIGHTED_AMOUNT);

    await mockJbPayDelegate.mock.didPay
      .withArgs({
        // JBDidPaydata obj
        payer: payer.address,
        projectId: PROJECT_ID,
        amount: AMOUNT,
        weight: WEIGHT,
        tokenCount: WEIGHTED_AMOUNT,
        beneficiary: beneficiary.address,
        memo: newMemo,
        delegateMetadata: delegateMetadata,
      })
      .returns();

    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(0);

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    const tx = await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordPaymentFrom(
        /* payer */ payer.address,
        /* amount */ AMOUNT,
        /* projectId */ PROJECT_ID,
        /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
        /* minReturnedTokens */ 0,
        /* memo */ memo,
        /* delegateMetadata */ [0],
      );

    await expect(tx)
      .to.emit(jbEthPaymentTerminalStore, 'DelegateDidPay')
      .withArgs(mockJbPayDelegate.address, [
        /* payer */ payer.address,
        /* projectId */ PROJECT_ID,
        /* amount */ AMOUNT,
        /* weight */ WEIGHT,
        /* tokenCount */ WEIGHTED_AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ newMemo,
        /* delegateMetadata */ ethers.BigNumber.from(delegateMetadata[0]),
      ]);

    // Expect recorded balance to change
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(AMOUNT);
  });

  it(`Should skip minting and recording payment if amount is 0`, async function () {
    const {
      terminal,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbPayDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
    } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

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

    const delegateMetadata = [0];
    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.payParams
      .withArgs({
        // JBPayParamsData obj
        payer: payer.address,
        amount: 0,
        weight: WEIGHT,
        reservedRate: reservedRate,
        beneficiary: beneficiary.address,
        memo: memo,
        delegateMetadata: delegateMetadata,
      })
      .returns(WEIGHT, newMemo, mockJbPayDelegate.address, delegateMetadata);

    await mockJbPayDelegate.mock.didPay
      .withArgs({
        // JBDidPaydata obj
        payer: payer.address,
        projectId: PROJECT_ID,
        amount: 0,
        weight: WEIGHT,
        tokenCount: 0,
        beneficiary: beneficiary.address,
        memo: newMemo,
        delegateMetadata: delegateMetadata,
      })
      .returns();

    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(0);

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    const tx = await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordPaymentFrom(
        /* payer */ payer.address,
        /* amount */ 0,
        /* projectId */ PROJECT_ID,
        /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
        /* minReturnedTokens */ 0,
        /* memo */ memo,
        /* delegateMetadata */ [0],
      );

    // Recorded balance should not have changed
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(0);

    await expect(tx)
      .to.emit(jbEthPaymentTerminalStore, 'DelegateDidPay')
      .withArgs(mockJbPayDelegate.address, [
        /* payer */ payer.address,
        /* projectId */ PROJECT_ID,
        /* amount */ 0,
        /* weight */ WEIGHT,
        /* tokenCount */ 0,
        /* beneficiary */ beneficiary.address,
        /* memo */ newMemo,
        /* delegateMetadata */ ethers.BigNumber.from(delegateMetadata[0]),
      ]);
  });

  /* Sad path tests */

  it(`Can't record payment without terminal access`, async function () {
    const { terminal, payer, beneficiary, jbEthPaymentTerminalStore } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    await expect(
      jbEthPaymentTerminalStore
        .connect(payer)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
          /* minReturnedTokens */ 0,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith('0x3a: UNAUTHORIZED');
  });

  it(`Can't record payment if terminal hasn't been set`, async function () {
    const { terminal, payer, beneficiary, jbEthPaymentTerminalStore } = await setup();

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
          /* minReturnedTokens */ 0,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith('0x3a: UNAUTHORIZED');
  });

  it(`Can't record payment if fundingCycle hasn't been configured`, async function () {
    const { terminal, payer, beneficiary, mockJbFundingCycleStore, jbEthPaymentTerminalStore } =
      await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // empty JBFundingCycle obj
      number: 0,
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
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
          /* minReturnedTokens */ 0,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith('0x3a: NOT_FOUND');
  });

  it(`Can't record payment if fundingCycle has been paused`, async function () {
    const { terminal, payer, beneficiary, mockJbFundingCycleStore, jbEthPaymentTerminalStore } =
      await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    const packedMetadata = packFundingCycleMetadata({ pausePay: 1 }); // Paused in the metadata

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
      metadata: packedMetadata,
    });

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
          /* minReturnedTokens */ 0,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith('0x3b: PAUSED');
  });

  it(`Can't record payment if tokens minted is less than _minReturnedTokens`, async function () {
    const {
      terminal,
      payer,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      jbEthPaymentTerminalStore,
      timestamp,
    } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    const reservedRate = 0;
    const minReturnedAmt = WEIGHTED_AMOUNT.addUnsafe(ethers.FixedNumber.from(1));
    const packedMetadata = packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: payer.address,
      metadata: packedMetadata,
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        WEIGHTED_AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'ETH received',
        /* preferClaimedTokens */ false,
        /* reservedRate */ reservedRate,
      )
      .returns(WEIGHTED_AMOUNT);

    // Record the payment
    const preferClaimedTokensBigNum = ethers.BigNumber.from(0); // false
    const beneficiaryBigNum = ethers.BigNumber.from(beneficiary.address).shl(1); // addr shifted left by 1
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordPaymentFrom(
          /* payer */ payer.address,
          AMOUNT,
          PROJECT_ID,
          /* preferClaimedTokensAndBeneficiary */ preferClaimedTokensBigNum.or(beneficiaryBigNum),
          /* minReturnedTokens */ ethers.FixedNumber.from(minReturnedAmt),
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith('0x3c: INADEQUATE');
  });
});
