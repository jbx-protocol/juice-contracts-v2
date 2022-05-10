import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata } from '../helpers/utils';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatorStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbToken721 from '../../artifacts/contracts/JBToken721.sol/JBToken721.json';
import jbToken721Store from '../../artifacts/contracts/JBToken721Store.sol/JBToken721Store.json';
import jbPrices from '../../artifacts/contracts/JBPrices.sol/JBPrices.json';
import jbPaymentTerminalStore from '../../artifacts/contracts/JBSingleTokenPaymentTerminalStore/1.sol/JBSingleTokenPaymentTerminalStore.json';

describe('JBNFTRewardDataSourceDelegate::didPay(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';
  const MEMO = 'Test Memo';
  const AMOUNT_TO_RECEIVE = 10_000;
  const CURRENCY_ETH = 1;
  const ETH_TO_PAY = ethers.utils.parseEther('1');
  const MIN_TOKEN_REQUESTED = 90;
  const PREFER_CLAIMED_TOKENS = true;
  const METADATA = '0x69';
  const FUNDING_CYCLE_NUMBER = 0;
  const TOKEN_RECEIVED = 100;
  const ADJUSTED_MEMO = 'test test memo';
  let ethToken;

  async function setup() {
    let [deployer, projectOwner, beneficiary, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken,
      mockJbTokenStore,
      mockJbToken721,
      mockJbToken721Store,
      mockJbPrices,
      mockJBPaymentTerminalStore
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbFundingCycleStore.abi),
      deployMockContract(deployer, jbOperatorStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi),
      deployMockContract(deployer, jbTokenStore.abi),
      deployMockContract(deployer, jbToken721.abi),
      deployMockContract(deployer, jbToken721Store.abi),
      deployMockContract(deployer, jbPrices.abi),
      deployMockContract(deployer, jbPaymentTerminalStore.abi),
    ]);

    let jbControllerFactory = await ethers.getContractFactory('contracts/JBController/1.sol:JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
      mockJbToken721Store.address
    );

    let jbEthTerminalFactory = await ethers.getContractFactory('contracts/JBETHPaymentTerminal/1.sol:JBETHPaymentTerminal', deployer);
    let jbEthPaymentTerminal = await jbEthTerminalFactory
      .connect(deployer)
      .deploy(
        CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJBPaymentTerminalStore.address,
        projectOwner.address,
      );

    ethToken = await jbEthPaymentTerminal.token();

    let jbNFTRewardDataSourceFactory = await ethers.getContractFactory('JBNFTRewardDataSourceDelegate', deployer);
    let jbNFTRewardDataSource = await jbNFTRewardDataSourceFactory
      .connect(deployer)
      .deploy(
        PROJECT_ID,
        jbController.address,
        mockJbToken721.address,
        1,
        { token: ethToken, value: 1, decimals: 18, currency: CURRENCY_ETH }
      );

    await mockJbTokenStore.mock.issueFor
      .withArgs(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL)
      .returns(mockJbToken.address);

    await mockJbToken721Store.mock.issueFor
      .withArgs(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://')
      .returns(mockJbToken721.address);

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(jbController.address);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbDirectory.mock.isTerminalOf.withArgs(PROJECT_ID, jbEthPaymentTerminal.address).returns(true);
    await mockJbDirectory.mock.isTerminalOf.withArgs(PROJECT_ID, jbNFTRewardDataSource.address).returns(false);

    const mockFundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ dataSource: jbNFTRewardDataSource.address, allowMinting: true }),
    };

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns(mockFundingCycle);

    await mockJbTokenStore.mock.mintFor.returns();
    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(AMOUNT_TO_RECEIVE);

    await mockJbToken721Store.mock.mintFor.returns(0);

    await jbController.connect(projectOwner).callStatic.issueTokenFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);
    await jbController.connect(projectOwner).callStatic.issueToken721For(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://');

    await mockJBPaymentTerminalStore.mock.recordPaymentFrom.returns(
      mockFundingCycle,
      MIN_TOKEN_REQUESTED,
      jbNFTRewardDataSource.address,
      MEMO
    );

    return {
      projectOwner,
      beneficiary,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbToken,
      mockJbToken721Store,
      mockJbToken721,
      timestamp,
      jbEthPaymentTerminal,
      ethToken,
      jbNFTRewardDataSource
    };
  }

  it(`Should mint token if meeting contribution parameters`, async function () {
    const { timestamp, jbEthPaymentTerminal, addrs } = await setup();
    const caller = addrs[0];
    const beneficiary = addrs[1];

    expect(
      await jbEthPaymentTerminal
        .connect(caller)
        .pay(
          PROJECT_ID,
          ETH_TO_PAY,
          ethers.constants.AddressZero,
          beneficiary.address,
          MIN_TOKEN_REQUESTED,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          { value: ETH_TO_PAY },
        ),
    )
      .to.emit(jbEthPaymentTerminal, 'Pay')
      .withArgs(
        timestamp,
        FUNDING_CYCLE_NUMBER,
        PROJECT_ID,
        caller.address,
        beneficiary.address,
        ETH_TO_PAY,
        TOKEN_RECEIVED,
        ADJUSTED_MEMO,
        METADATA,
        caller.address
      );
  });

  it(`Should not mint token if exceeding max supply`, async function () {
    const { jbEthPaymentTerminal, addrs } = await setup();
    const caller = addrs[0];
    const beneficiary = addrs[1];

    await jbEthPaymentTerminal.connect(caller).pay(PROJECT_ID, ETH_TO_PAY, ethers.constants.AddressZero, beneficiary.address, MIN_TOKEN_REQUESTED, PREFER_CLAIMED_TOKENS, MEMO, METADATA, { value: ETH_TO_PAY });

    expect(await jbEthPaymentTerminal.connect(caller).pay(PROJECT_ID, ETH_TO_PAY, ethers.constants.AddressZero, beneficiary.address, MIN_TOKEN_REQUESTED, PREFER_CLAIMED_TOKENS, MEMO, METADATA, { value: ETH_TO_PAY }))
      .to.not.emit(jbEthPaymentTerminal, 'Pay')
  });

  it(`Tests for unsupported pay functions`, async function () {
    const { jbNFTRewardDataSource, jbEthPaymentTerminal, addrs } = await setup();

    await jbNFTRewardDataSource.payParams({
      terminal: jbEthPaymentTerminal.address,
      payer: addrs[0].address,
      amount: { token: ethToken, value: 1, decimals: 18, currency: CURRENCY_ETH },
      projectId: PROJECT_ID,
      currentFundingCycleConfiguration: 0,
      beneficiary: addrs[1].address,
      weight: 0,
      reservedRate: 0,
      memo: '',
      metadata: ethers.utils.toUtf8Bytes('')
    });
  });

  it(`Tests for unsupported redeem functions`, async function () {
    const { jbNFTRewardDataSource, jbEthPaymentTerminal, addrs } = await setup();

    await jbNFTRewardDataSource.didRedeem({
      holder: addrs[0].address,
      projectId: PROJECT_ID,
      currentFundingCycleConfiguration: 0,
      projectTokenCount: 0,
      reclaimedAmount: { token: ethToken, value: 1, decimals: 18, currency: CURRENCY_ETH },
      beneficiary: addrs[0].address,
      memo: '',
      metadata: ethers.utils.toUtf8Bytes('')
    });

    await jbNFTRewardDataSource.redeemParams({
      terminal: jbEthPaymentTerminal.address,
      holder: addrs[0].address,
      projectId: PROJECT_ID,
      currentFundingCycleConfiguration: 0,
      tokenCount: 0,
      totalSupply: 0,
      overflow: 0,
      reclaimAmount: { token: ethToken, value: 1, decimals: 18, currency: CURRENCY_ETH },
      useTotalOverflow: false,
      redemptionRate: 0,
      ballotRedemptionRate: 0,
      memo: '',
      metadata: ethers.utils.toUtf8Bytes('')
    });
  });

  it(`Test supportsInterface()`, async function () {
    const { jbNFTRewardDataSource } = await setup();

    let match = await jbNFTRewardDataSource.supportsInterface(0x599064e9); // IJBFundingCycleDataSource
    expect(match).to.equal(true);

    match = await jbNFTRewardDataSource.supportsInterface(0x304b1eea); // IJBPayDelegate
    expect(match).to.equal(true);

    match = await jbNFTRewardDataSource.supportsInterface(0x2400e8f7); // IJBRedemptionDelegate
    expect(match).to.equal(true);
  });
});
