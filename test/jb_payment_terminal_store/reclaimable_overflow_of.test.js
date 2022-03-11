import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata, impersonateAccount } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBPaymentTerminalStore::reclaimableOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');
  const CURRENCY = 1;
  const BASE_CURRENCY = 0;

  async function setup() {
    const [deployer] = await ethers.getSigners();

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

    await mockJbTerminal.mock.currency.returns(CURRENCY);

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    return {
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    };
  }

  it('Should return claimable overflow with rate from active ballot', async function () {
    /*
      Calculator params for https://www.desmos.com/calculator/sp9ru6zbpk:
      o (available overflow) = 100 ETH
      s (total token supply) = 100
      r (redemption rate) = .65
      x (token claim amount) = 50
      Should result in a redemption of y = 41.25 ETH
    */
    const {
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

    const overflowAmt = ethers.FixedNumber.from(100);
    const tokenAmt = ethers.FixedNumber.from(50);

    const reservedRate = 0;
    const fundingCycleMetadata = packFundingCycleMetadata({
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
      ballotRedemptionRate: 6500, // 65% redemption rate
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: fundingCycleMetadata,
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(overflowAmt);

    const totalSupply = tokenAmt.mulUnsafe(ethers.FixedNumber.from(2));
    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(totalSupply); // totalSupply of 100

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(0);

    // Use active ballot
    await mockJbFundingCycleStore.mock.currentBallotStateOf.withArgs(PROJECT_ID).returns(1);

    // Add to balance beforehand to have an overflow of exactly 100
    const startingBalance = overflowAmt.mulUnsafe(ethers.FixedNumber.from(2));
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Get claimable overflow where tokenCount is half the total supply of tokens
    expect(
      await JBPaymentTerminalStore.reclaimableOverflowOf(mockJbTerminalSigner.address, PROJECT_ID, /* tokenCount */ tokenAmt, CURRENCY),
    ).to.equal(ethers.FixedNumber.fromString('41.25'));
  });

  it('Should return 0 if there is no overflow', async function () {
    const {
      mockJbTerminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    const overflowAmt = ethers.FixedNumber.from(100);
    const tokenAmt = ethers.FixedNumber.from(50);

    const reservedRate = 0;
    const fundingCycleMetadata = packFundingCycleMetadata({
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
      ballotRedemptionRate: 6500, // 65% redemption rate
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: fundingCycleMetadata,
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(overflowAmt);

    // Get claimable overflow
    expect(
      await JBPaymentTerminalStore.reclaimableOverflowOf(mockJbTerminal.address, PROJECT_ID, /* tokenCount */ tokenAmt, CURRENCY),
    ).to.equal(0);
  });

  it('Should return 0 if redemption rate is 0', async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    const overflowAmt = ethers.FixedNumber.from(100);
    const tokenAmt = ethers.FixedNumber.from(50);

    const reservedRate = 0;
    const fundingCycleMetadata = packFundingCycleMetadata({
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
      ballotRedemptionRate: 0, // 0% redemption rate
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: fundingCycleMetadata,
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(overflowAmt);

    const totalSupply = tokenAmt.mulUnsafe(ethers.FixedNumber.from(2));
    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(totalSupply); // totalSupply of 100

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(0);

    // Use active ballot
    await mockJbFundingCycleStore.mock.currentBallotStateOf.withArgs(PROJECT_ID).returns(1);

    // Add to balance beforehand to have an overflow of exactly 100
    const startingBalance = overflowAmt.mulUnsafe(ethers.FixedNumber.from(2));
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Get claimable overflow
    expect(
      await JBPaymentTerminalStore.reclaimableOverflowOf(mockJbTerminalSigner.address, PROJECT_ID, /* tokenCount */ tokenAmt, CURRENCY),
    ).to.equal(0);
  });

  it('Should return claimable overflow amount if redemption rate is 100%', async function () {
    /*
      Calculator params for https://www.desmos.com/calculator/sp9ru6zbpk:
      o (available overflow) = 100 ETH
      s (total token supply) = 100
      r (redemption rate) = 1.0
      x (token claim amount) = 50
      Should result in a redemption of y = 50 ETH
    */
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      JBPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    const overflowAmt = ethers.FixedNumber.from(100);
    const tokenAmt = ethers.FixedNumber.from(50);

    const reservedRate = 10;
    const fundingCycleMetadata = packFundingCycleMetadata({
      reservedRate: reservedRate,
      useLocalBalanceForRedemptions: 1,
      redemptionRate: 10000, // 100% redemption rate
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: fundingCycleMetadata,
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitCurrencyOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(CURRENCY_ETH);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address)
      .returns(overflowAmt);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(tokenAmt);

    await mockJbController.mock.reservedTokenBalanceOf
      .withArgs(PROJECT_ID, reservedRate)
      .returns(ethers.FixedNumber.from(50)); // added to tokenSupply

    // Use regular redemption rate
    await mockJbFundingCycleStore.mock.currentBallotStateOf.withArgs(PROJECT_ID).returns(0);

    // Add to balance beforehand to have an overflow of exactly 100
    const startingBalance = overflowAmt.mulUnsafe(ethers.FixedNumber.from(2));
    await JBPaymentTerminalStore
      .connect(mockJbTerminalSigner)
      .recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Get claimable overflow where tokenCount is half the total supply of tokens
    expect(
      await JBPaymentTerminalStore.reclaimableOverflowOf(mockJbTerminalSigner.address, PROJECT_ID, /* tokenCount */ tokenAmt, CURRENCY),
    ).to.equal(ethers.FixedNumber.from(50));
  });
});
