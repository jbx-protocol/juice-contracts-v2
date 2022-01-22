import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbFundingCycleDataSource from '../../artifacts/contracts/interfaces/IJBFundingCycleDataSource.sol/IJBFundingCycleDataSource.json';
import jbRedemptionDelegate from '../../artifacts/contracts/interfaces/IJBRedemptionDelegate.sol/IJBRedemptionDelegate.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBETHPaymentTerminalStore::recordRedemptionFor(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');

  async function setup() {
    const [deployer, terminal, holder, beneficiary] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbFundingCycleDataSource = await deployMockContract(
      deployer,
      jbFundingCycleDataSource.abi,
    );
    const mockJbRedemptionDelegate = await deployMockContract(deployer, jbRedemptionDelegate.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, jbController.abi);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

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

    /* Common mocks */

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    return {
      terminal,
      holder,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbTokenStore,
      mockJbRedemptionDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    };
  }

  /* Happy path tests with terminal access */

  it('Should record redemption without a datasource', async function () {
    const {
      terminal,
      holder,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      jbEthPaymentTerminalStore,
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
    await mockJbController.mock.currencyOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, terminal.address)
      .returns(AMOUNT);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(AMOUNT);

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(0);
    /* End of mocks for _claimableOverflowOf private method */

    await mockJbController.mock.burnTokensOf
      .withArgs(
        holder.address,
        PROJECT_ID,
        AMOUNT,
        /* memo */ 'Redeem for ETH',
        /* preferClaimedTokens */ true,
      )
      .returns();

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mulUnsafe(ethers.FixedNumber.from(2));
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(startingBalance);

    // Record redemption
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordRedemptionFor(
        /* holder */ holder.address,
        /* projectId */ PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'test',
        /* delegateMetadata */ 0,
      );

    // Expect recorded balance to decrease by redeemed amount
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(
      startingBalance.subUnsafe(AMOUNT),
    );
  });

  it('Should record redemption with a datasource and emit event', async function () {
    const {
      terminal,
      holder,
      beneficiary,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      mockJbRedemptionDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
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

    const delegateMetadata = [0];
    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.redeemParams
      .withArgs({
        // JBRedeemParamsData obj
        holder: holder.address,
        tokenCount: AMOUNT,
        projectId: PROJECT_ID,
        redemptionRate: redemptionRate,
        ballotRedemptionRate: ballotRedemptionRate,
        beneficiary: beneficiary.address,
        memo: 'test',
        delegateMetadata: delegateMetadata,
      })
      .returns(AMOUNT, newMemo, mockJbRedemptionDelegate.address, delegateMetadata);

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.burnTokensOf
      .withArgs(
        holder.address,
        PROJECT_ID,
        AMOUNT,
        /* memo */ 'Redeem for ETH',
        /* preferClaimedTokens */ true,
      )
      .returns();

    await mockJbRedemptionDelegate.mock.didRedeem
      .withArgs({
        // JBDidRedeemData obj
        holder: holder.address,
        projectId: PROJECT_ID,
        tokenCount: AMOUNT,
        claimAmount: AMOUNT,
        beneficiary: beneficiary.address,
        memo: newMemo,
        metadata: delegateMetadata,
      })
      .returns();

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mulUnsafe(ethers.FixedNumber.from(2));
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(startingBalance);

    // Record redemption
    const tx = await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordRedemptionFor(
        /* holder */ holder.address,
        /* projectId */ PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'test',
        /* delegateMetadata */ delegateMetadata,
      );

    await expect(tx)
      .to.emit(jbEthPaymentTerminalStore, 'DelegateDidRedeem')
      .withArgs(mockJbRedemptionDelegate.address, [
        /* holder */ holder.address,
        /* projectId */ PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* claimAmount */ AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ newMemo,
        /* delegateMetadata */ ethers.BigNumber.from(delegateMetadata),
      ]);

    // Expect recorded balance to decrease by redeemed amount
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(
      startingBalance.subUnsafe(AMOUNT),
    );
  });

  /* Sad path tests */

  it(`Can't record redemption without terminal access`, async function () {
    const { holder, beneficiary, jbEthPaymentTerminalStore } = await setup();

    // Record redemption
    await expect(
      jbEthPaymentTerminalStore
        .connect(holder)
        .recordRedemptionFor(
          /* holder */ holder.address,
          /* projectId */ PROJECT_ID,
          /* tokenCount */ AMOUNT,
          /* minReturnedWei */ AMOUNT,
          /* beneficiary */ beneficiary.address,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it(`Can't record redemption if tokenCount is 0`, async function () {
    const { terminal, holder, beneficiary, jbEthPaymentTerminalStore } = await setup();

    // Record redemption
    await expect(
      jbEthPaymentTerminalStore.connect(terminal).recordRedemptionFor(
        /* holder */ holder.address,
        /* projectId */ PROJECT_ID,
        /* tokenCount */ 0, // Set to 0
        /* minReturnedWei */ AMOUNT,
        /* beneficiary */ beneficiary.address,
        /* memo */ 'test',
        /* delegateMetadata */ 0,
      ),
    ).to.be.revertedWith(errors.TOKEN_AMOUNT_ZERO);
  });

  it(`Can't record redemption if token total balance < tokenCount`, async function () {
    const { terminal, holder, beneficiary, mockJbTokenStore, jbEthPaymentTerminalStore } =
      await setup();

    await mockJbTokenStore.mock.balanceOf.withArgs(holder.address, PROJECT_ID).returns(0); // Token total balance set to 0

    // Record redemption
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordRedemptionFor(
          /* holder */ holder.address,
          /* projectId */ PROJECT_ID,
          /* tokenCount */ AMOUNT,
          /* minReturnedWei */ AMOUNT,
          /* beneficiary */ beneficiary.address,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith(errors.INSUFFICIENT_TOKENS);
  });

  it(`Can't record redemption if redemptions are paused`, async function () {
    const {
      terminal,
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      jbEthPaymentTerminalStore,
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
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordRedemptionFor(
          /* holder */ holder.address,
          /* projectId */ PROJECT_ID,
          /* tokenCount */ AMOUNT,
          /* minReturnedWei */ AMOUNT,
          /* beneficiary */ beneficiary.address,
          /* memo */ 'test',
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith(errors.FUNDING_CYCLE_REDEEM_PAUSED);
  });

  it(`Can't record redemption if there are no claimable tokens`, async function () {
    const {
      terminal,
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      mockJbRedemptionDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
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

    const delegateMetadata = [0];
    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.redeemParams
      .withArgs({
        // JBRedeemParamsData obj
        holder: holder.address,
        tokenCount: AMOUNT,
        projectId: PROJECT_ID,
        redemptionRate: redemptionRate,
        ballotRedemptionRate: ballotRedemptionRate,
        beneficiary: beneficiary.address,
        memo: 'test',
        delegateMetadata: delegateMetadata,
      })
      .returns(/* claimAmount */ 0, newMemo, mockJbRedemptionDelegate.address, delegateMetadata); // Delegate will return 0 as the claimable amount

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mulUnsafe(ethers.FixedNumber.from(2));
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Record redemption
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordRedemptionFor(
          /* holder */ holder.address,
          /* projectId */ PROJECT_ID,
          /* tokenCount */ AMOUNT,
          /* minReturnedWei */ startingBalance,
          /* beneficiary */ beneficiary.address,
          /* memo */ 'test',
          /* delegateMetadata */ delegateMetadata,
        ),
    ).to.be.revertedWith(errors.NO_CLAIMABLE_TOKENS);
  });

  it(`Can't record redemption with if claim amount > project's total balance`, async function () {
    const {
      terminal,
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      mockJbRedemptionDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
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

    const delegateMetadata = [0];
    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.redeemParams
      .withArgs({
        // JBRedeemParamsData obj
        holder: holder.address,
        tokenCount: AMOUNT,
        projectId: PROJECT_ID,
        redemptionRate: redemptionRate,
        ballotRedemptionRate: ballotRedemptionRate,
        beneficiary: beneficiary.address,
        memo: 'test',
        delegateMetadata: delegateMetadata,
      })
      .returns(AMOUNT, newMemo, mockJbRedemptionDelegate.address, delegateMetadata);

    // Note: The store has 0 balance because we haven't added anything to it
    // Record redemption
    await expect(
      jbEthPaymentTerminalStore
        .connect(terminal)
        .recordRedemptionFor(
          /* holder */ holder.address,
          /* projectId */ PROJECT_ID,
          /* tokenCount */ AMOUNT,
          /* minReturnedWei */ AMOUNT,
          /* beneficiary */ beneficiary.address,
          /* memo */ 'test',
          /* delegateMetadata */ delegateMetadata,
        ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });

  it(`Can't record redemption if claimAmount < minReturnedWei`, async function () {
    const {
      terminal,
      holder,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbFundingCycleDataSource,
      mockJbRedemptionDelegate,
      jbEthPaymentTerminalStore,
      timestamp,
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

    const delegateMetadata = [0];
    const newMemo = 'new memo';
    await mockJbFundingCycleDataSource.mock.redeemParams
      .withArgs({
        // JBRedeemParamsData obj
        holder: holder.address,
        tokenCount: AMOUNT,
        projectId: PROJECT_ID,
        redemptionRate: redemptionRate,
        ballotRedemptionRate: ballotRedemptionRate,
        beneficiary: beneficiary.address,
        memo: 'test',
        delegateMetadata: delegateMetadata,
      })
      .returns(AMOUNT, newMemo, mockJbRedemptionDelegate.address, delegateMetadata);

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mulUnsafe(ethers.FixedNumber.from(2));
    await jbEthPaymentTerminalStore
      .connect(terminal)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Record redemption
    await expect(
      jbEthPaymentTerminalStore.connect(terminal).recordRedemptionFor(
        /* holder */ holder.address,
        /* projectId */ PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT.addUnsafe(AMOUNT), // We've set this higher than the claim amount
        /* beneficiary */ beneficiary.address,
        /* memo */ 'test',
        /* delegateMetadata */ delegateMetadata,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_CLAIM_AMOUNT);
  });
});
