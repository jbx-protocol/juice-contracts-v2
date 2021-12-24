import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata, makeSplits } from '../helpers/utils';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbAllocator from '../../artifacts/contracts/interfaces/IJBSplitAllocator.sol/IJBSplitAllocator.json';

describe('JBController::distributeReservedTokensOf(...)', function () {
  const PROJECT_ID = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';
  const MEMO = 'Test Memo'
  const RESERVED_AMOUNT = 20000;

  let MINT_INDEX;
  let RESERVED_SPLITS_GROUP;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();
    MINT_INDEX = await jbOperations.MINT();

    let jbSplitsGroupsFactory = await ethers.getContractFactory('JBSplitsGroups');
    let jbSplitsGroups = await jbSplitsGroupsFactory.deploy();
    RESERVED_SPLITS_GROUP = await jbSplitsGroups.RESERVED_TOKENS();
  });

  async function setup() {
    let [deployer, projectOwner, beneficiary, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let promises = [];

    promises.push(deployMockContract(deployer, jbOperatoreStore.abi));
    promises.push(deployMockContract(deployer, jbProjects.abi));
    promises.push(deployMockContract(deployer, jbDirectory.abi));
    promises.push(deployMockContract(deployer, jbFundingCycleStore.abi));
    promises.push(deployMockContract(deployer, jbTokenStore.abi));
    promises.push(deployMockContract(deployer, jbSplitsStore.abi));
    promises.push(deployMockContract(deployer, jbToken.abi));
    promises.push(deployMockContract(deployer, jbAllocator.abi));

    let [mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockSplitsStore,
      mockToken,
      mockAllocator] = await Promise.all(promises);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    promises = [];

    promises.push(mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address));

    promises.push(mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, projectOwner.address)
      .returns(false));

    promises.push(mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ reservedRate: 10000 })
    }));

    // No token has been distributed/minted since the reserved rate is 100
    promises.push(mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(0));

    await Promise.all(promises);

    // Minting the reserved token
    await jbController.connect(projectOwner)
      .mintTokensOf(PROJECT_ID, RESERVED_AMOUNT, ethers.constants.AddressZero, MEMO, /*_preferClaimedTokens=*/true, 10000);

    return {
      projectOwner,
      addrs,
      jbController,
      mockAllocator,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      mockSplitsStore,
      mockJbProjects,
      timestamp
    };
  }

  it(`Should send to beneficiaries if no allocator or project id is set in splits`, async function () {
    const { addrs, projectOwner, jbController, mockTokenStore, mockSplitsStore, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
    })

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await Promise.all(
      splitsBeneficiariesAddresses.map(async (beneficiary) => {
        await mockTokenStore.mock.mintFor
          .withArgs(beneficiary, PROJECT_ID, Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length), /*_preferClaimedTokens=*/true)
          .returns();
      })
    );

    expect(await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO))
      .to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    //Still not fixed in 12/2021: https://github.com/EthWorks/Waffle/issues/245
    // Expect one event per split + one event for the whole transaction
    await Promise.all([
      splits.map((split) => {
        expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
          .withArgs(
            timestamp,
            1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.lockedUntil,
              split.beneficiary,
              split.allocator,
              split.projectId
            ],
            RESERVED_AMOUNT / splits.length,
            caller.address)
      }),
      expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
              /*fundingCycleConfiguration=*/timestamp,
              /*fundingCycleNumber=*/1,
              /*projectId=*/PROJECT_ID,
              /*projectOwner=*/projectOwner.address,
              /*count=*/RESERVED_AMOUNT,
              /*leftoverTokenCount=*/0,
              /*memo=*/MEMO,
              /*caller=*/caller.address
        )
    ]);
  });

  it(`Should send to the project owner if project id is set but not allocator in splits`, async function () {
    const { addrs, projectOwner, jbController, mockTokenStore, mockSplitsStore, mockJbProjects, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const otherProjectId = 2;
    const otherProjectOwner = addrs[3];

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
      projectId: otherProjectId
    })

    await mockJbProjects.mock.ownerOf
      .withArgs(otherProjectId)
      .returns(otherProjectOwner.address)

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await mockTokenStore.mock.mintFor
      .withArgs(otherProjectOwner.address, PROJECT_ID, Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length), true)
      .returns();


    expect(await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO))
      .to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    //Still not fixed in 12/2021: https://github.com/EthWorks/Waffle/issues/245
    // Expect one event per split + one event for the whole transaction
    await Promise.all([
      splits.map(async (split, _) => {
        expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
          .withArgs(
            timestamp,
            1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.lockedUntil,
              split.beneficiary,
              split.allocator,
              split.projectId
            ],
            RESERVED_AMOUNT / splits.length,
            caller.address)
      }),
      expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
                /*fundingCycleConfiguration=*/timestamp,
                /*fundingCycleNumber=*/1,
                /*projectId=*/PROJECT_ID,
                /*projectOwner=*/projectOwner.address,
                /*count=*/RESERVED_AMOUNT,
                /*leftoverTokenCount=*/0,
                /*memo=*/MEMO,
                /*caller=*/caller.address
        )
    ]);
  });

  it(`Should send to the allocators if set in splits`, async function () {
    const { addrs, projectOwner, jbController, mockTokenStore, mockSplitsStore, mockAllocator, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);
    const otherProjectId = 2;

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
      allocator: mockAllocator.address,
      projectId: otherProjectId
    })

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await mockTokenStore.mock.mintFor
      .withArgs(mockAllocator.address, PROJECT_ID, Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length), true)
      .returns();

    await Promise.all(
      splitsBeneficiariesAddresses.map(async (beneficiary) => {
        await mockAllocator.mock.allocate
          .withArgs(
            Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
            RESERVED_SPLITS_GROUP,
            PROJECT_ID,
            otherProjectId,
            beneficiary,
            true)
          .returns();
      })
    );

    expect(await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO))
      .to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    //Still not fixed in 12/2021: https://github.com/EthWorks/Waffle/issues/245
    // Expect one event per split + one event for the whole transaction
    await Promise.all([
      splits.map(async (split, _) => {
        expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
          .withArgs(
            timestamp,
            1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.lockedUntil,
              split.beneficiary,
              split.allocator,
              split.projectId
            ],
            RESERVED_AMOUNT / splits.length,
            caller.address)
      }),
      expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
              /*fundingCycleConfiguration=*/timestamp,
              /*fundingCycleNumber=*/1,
              /*projectId=*/PROJECT_ID,
              /*projectOwner=*/projectOwner.address,
              /*count=*/RESERVED_AMOUNT,
              /*leftoverTokenCount=*/0,
              /*memo=*/MEMO,
              /*caller=*/caller.address
        )
    ]);
  });

  it(`Should send all left-over tokens to the project owner`, async function () {
    const { addrs, projectOwner, jbController, mockTokenStore, mockSplitsStore, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
      redemptionRate: 0,
    })

    splits[1].percent = 0; // A total of 50% is now allocated

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await mockTokenStore.mock.mintFor
      .withArgs(splitsBeneficiariesAddresses[0], PROJECT_ID, Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length), /*_preferClaimedTokens=*/true)
      .returns();

    await mockTokenStore.mock.mintFor
      .withArgs(splitsBeneficiariesAddresses[1], PROJECT_ID, 0, /*_preferClaimedTokens=*/true)
      .returns();

    await mockTokenStore.mock.mintFor
      .withArgs(projectOwner.address, PROJECT_ID, Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length), /*_preferClaimedTokens=*/false)
      .returns();

    expect(await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO))
      .to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    //Still not fixed in 12/2021: https://github.com/EthWorks/Waffle/issues/245
    // Expect one event per non-null split + one event for the whole transaction
    await Promise.all([
      expect(tx)
        .to.emit(jbController, 'DistributeToReservedTokenSplit')
        .withArgs(
          timestamp,
          1,
          PROJECT_ID,
          [
            splits[0].preferClaimed,
            splits[0].percent,
            splits[0].lockedUntil,
            splits[0].beneficiary,
            splits[0].allocator,
            splits[0].projectId
          ],
          RESERVED_AMOUNT / splitsBeneficiariesAddresses.length,
          caller.address),
      expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
            /*fundingCycleConfiguration=*/timestamp,
            /*fundingCycleNumber=*/1,
            /*projectId=*/PROJECT_ID,
            /*projectOwner=*/projectOwner.address,
            /*count=*/RESERVED_AMOUNT,
            /*leftoverTokenCount=*/RESERVED_AMOUNT / splitsBeneficiariesAddresses.length,
            /*memo=*/MEMO,
            /*caller=*/caller.address
        )
    ]);
  });

  it(`Should not revert if called with 0 tokens in reserve`, async function () {
    const { addrs, jbController, mockTokenStore, mockSplitsStore, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
    })

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await Promise.all(
      splitsBeneficiariesAddresses.map(async (beneficiary) => {
        await mockTokenStore.mock.mintFor
          .withArgs(beneficiary, PROJECT_ID, Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length), /*_preferClaimedTokens=*/true)
          .returns();
      })
    );

    await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(RESERVED_AMOUNT);

    expect(await jbController.reservedTokenBalanceOf(PROJECT_ID, /*RESERVED_RATE=*/10000))
      .to.equal(0);

    await expect(jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO))
      .to.be.not.reverted;
  });

});