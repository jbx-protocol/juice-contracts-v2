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
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPaymentTerminal.sol/IJBPaymentTerminal.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBPaymentTerminalStore::recordRedemptionFor(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.BigNumber.from('4398541');
  const WEIGHT = ethers.BigNumber.from('900000000');
  const CURRENCY = ethers.BigNumber.from(1);
  const METADATA = ethers.utils.randomBytes(32);
  const _FIXED_POINT_MAX_FIDELITY = 18;

  async function setup() {
    const [deployer, holder, beneficiary, ...addrs] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbFundingCycleDataSource = await deployMockContract(
      deployer,
      jbFundingCycleDataSource.abi,
    );
    const mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, jbController.abi);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

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

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    return {
      holder,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      addrs,
    };
  }

  /* Happy path tests with mockJbTerminal access */

  it('Should record redemption without a datasource', async function () {
    const {
      holder,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(AMOUNT);

    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pauseRedeem: 0,
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
    });

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

    /* Mocks for _reclaimableOverflowOf private method */
    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(AMOUNT);

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(0);
    /* End of mocks for _reclaimableOverflowOf private method */

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mul(ethers.BigNumber.from(2));
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      startingBalance,
    );

    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance);

    // Record redemption
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordRedemptionFor(
      /* holder */ holder.address,
      /* projectId */ PROJECT_ID,
      /* tokenCount */ AMOUNT,
      /* balanceDecimals*/ 18,
      /* balanceCurrency */ CURRENCY,
      /* beneficiary */ beneficiary.address,
      /* memo */ 'test',
      METADATA
    );

    // Expect recorded balance to decrease by redeemed amount
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance.sub(AMOUNT));
  });

  it('Should record redemption without a token count', async function () {
    const {
      holder,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(AMOUNT);

    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pauseRedeem: 0,
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
    });

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

    /* Mocks for _claimableOverflowOf private method */
    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(AMOUNT);

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(0);

    /* End of mocks for _claimableOverflowOf private method */

    // No balance.
    const startingBalance = 0;

    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance);

    // Record redemption
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordRedemptionFor(
      /* holder */ holder.address,
      /* projectId */ PROJECT_ID,
      /* tokenCount */ 0,
      /* balanceDecimals*/ 18,
      /* balanceCurrency */ CURRENCY,
      /* beneficiary */ beneficiary.address,
      /* memo */ 'test',
      METADATA
    );

    // Expect recorded balance to not have changed
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance);
  });

  it('Should record redemption without a claim amount', async function () {
    const {
      holder,
      beneficiary,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(AMOUNT);

    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pauseRedeem: 0,
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
    });

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

    /* Mocks for _reclaimableOverflowOf private method */
    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(AMOUNT);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(AMOUNT);

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(0);
    /* End of mocks for _reclaimableOverflowOf private method */

    // No balance
    const startingBalance = 0;

    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance);

    // Record redemption
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordRedemptionFor(
      /* holder */ holder.address,
      /* projectId */ PROJECT_ID,
      /* tokenCount */ AMOUNT,
      /* balanceDecimals*/ 18,
      /* balanceCurrency */ CURRENCY,
      /* beneficiary */ beneficiary.address,
      /* memo */ 'test',
      METADATA
    );

    // Expect recorded balance to not have changed
    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance);
  });

  it('Should record redemption with a datasource and emit event', async function () {
    const {
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTerminalSigner,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      JBPaymentTerminalStore,
      timestamp,
      addrs,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(AMOUNT);

    const reservedRate = 0;
    const redemptionRate = 10000;
    const ballotRedemptionRate = 10000;
    const packedMetadata = packFundingCycleMetadata({
      pauseRedeem: 0,
      reservedRate: reservedRate,
      redemptionRate: redemptionRate,
      ballotRedemptionRate: ballotRedemptionRate,
      useLocalBalanceForRedemptions: 1,
      useDataSourceForRedeem: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });
    const delegate = addrs[0];

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

    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.redeemParams
      .withArgs({
        // JBRedeemParamsData obj
        terminal: mockJbTerminalSigner.address,
        holder: holder.address,
        tokenCount: AMOUNT,
        decimals: _FIXED_POINT_MAX_FIDELITY,
        projectId: PROJECT_ID,
        redemptionRate: redemptionRate,
        ballotRedemptionRate: ballotRedemptionRate,
        currency: CURRENCY,
        beneficiary: beneficiary.address,
        memo: 'test',
        metadata: METADATA
      })
      .returns(AMOUNT, newMemo, delegate.address);

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mul(ethers.FixedNumber.from(2));
    await JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      startingBalance,
    );

    expect(
      await JBPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(startingBalance);

    // Record redemption
    const tx = await JBPaymentTerminalStore.connect(
      mockJbTerminalSigner,
    ).callStatic.recordRedemptionFor(
      /* holder */ holder.address,
      /* projectId */ PROJECT_ID,
      /* tokenCount */ AMOUNT,
      /* balanceDecimals*/ 18,
      /* balanceCurrency */ CURRENCY,
      /* beneficiary */ beneficiary.address,
      /* memo */ 'test',
      METADATA
    );

    expect(tx.delegate).to.equal(delegate.address);
  });

  /* Sad path tests */

  it(`Can't record redemption if token total balance < tokenCount`, async function () {
    const {
      holder,
      beneficiary,
      mockJbTerminalSigner,
      mockJbTokenStore,
      JBPaymentTerminalStore,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(0); // Token total balance set to 0

    // Record redemption
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordRedemptionFor(
      /* holder */ holder.address,
      /* projectId */ PROJECT_ID,
      /* tokenCount */ AMOUNT,
      /* balanceDecimals*/ 18,
      /* balanceCurrency */ CURRENCY,
      /* beneficiary */ beneficiary.address,
      /* memo */ 'test',
      METADATA
      ),
    ).to.be.revertedWith(errors.INSUFFICIENT_TOKENS);
  });

  it(`Can't record redemption if redemptions are paused`, async function () {
    const {
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTerminalSigner,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      JBPaymentTerminalStore,
      timestamp,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(AMOUNT);

    const reservedRate = 0;
    const redemptionRate = 10000;
    const ballotRedemptionRate = 10000;
    const packedMetadata = packFundingCycleMetadata({
      pauseRedeem: 1, // Redemptions paused
      reservedRate: reservedRate,
      redemptionRate: redemptionRate,
      ballotRedemptionRate: ballotRedemptionRate,
      useLocalBalanceForRedemptions: 1,
      useDataSourceForRedeem: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });

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

    // Record redemption
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordRedemptionFor(
      /* holder */ holder.address,
      /* projectId */ PROJECT_ID,
      /* tokenCount */ AMOUNT,
      /* balanceDecimals*/ 18,
      /* balanceCurrency */ CURRENCY,
      /* beneficiary */ beneficiary.address,
      /* memo */ 'test',
      METADATA
      ),
    ).to.be.revertedWith(errors.FUNDING_CYCLE_REDEEM_PAUSED);
  });

  it(`Can't record redemption with if claim amount > project's total balance`, async function () {
    const {
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTerminalSigner,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      JBPaymentTerminalStore,
      timestamp,
      addrs,
    } = await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(AMOUNT);

    const reservedRate = 0;
    const redemptionRate = 10000;
    const ballotRedemptionRate = 10000;
    const packedMetadata = packFundingCycleMetadata({
      pauseRedeem: 0,
      reservedRate: reservedRate,
      redemptionRate: redemptionRate,
      ballotRedemptionRate: ballotRedemptionRate,
      useLocalBalanceForRedemptions: 1,
      useDataSourceForRedeem: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });
    const delegate = addrs[0];

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

    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.redeemParams
      .withArgs({
        // JBRedeemParamsData obj
        terminal: mockJbTerminalSigner.address,
        holder: holder.address,
        tokenCount: AMOUNT,
        decimals: _FIXED_POINT_MAX_FIDELITY,
        projectId: PROJECT_ID,
        redemptionRate: redemptionRate,
        ballotRedemptionRate: ballotRedemptionRate,
        currency: CURRENCY,
        beneficiary: beneficiary.address,
        memo: 'test',
        metadata: METADATA
      })
      .returns(AMOUNT, newMemo, delegate.address);

    // Note: The store has 0 balance because we haven't added anything to it
    // Record redemption
    await expect(
      JBPaymentTerminalStore.connect(mockJbTerminalSigner).recordRedemptionFor(
        /* holder */ holder.address,
        /* projectId */ PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* balanceDecimals*/ 18,
        /* balanceCurrency */ CURRENCY,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'test',
        METADATA
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
});
