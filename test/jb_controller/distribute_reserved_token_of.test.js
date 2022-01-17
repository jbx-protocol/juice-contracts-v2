import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata, makeSplits } from '../helpers/utils';

import jbAllocator from '../../artifacts/contracts/interfaces/IJBSplitAllocator.sol/IJBSplitAllocator.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';

describe('JBController::distributeReservedTokensOf(...)', function () {
  const PROJECT_ID = 1;
  const MEMO = 'Test Memo';
  const RESERVED_AMOUNT = 20000;
  const PREFERED_CLAIMED_TOKEN = true;

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
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbAllocator,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockSplitsStore,
      mockJbToken,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbAllocator.abi),
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbFundingCycleStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi),
      deployMockContract(deployer, jbTokenStore.abi),
    ]);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockSplitsStore.address,
    );
    
    await Promise.all([
      mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address),
      mockJbDirectory.mock.isTerminalDelegateOf
          .withArgs(PROJECT_ID, projectOwner.address)
          .returns(false),
      mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata({ reservedRate: 10000 }),
        }),

        mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(0),
    ]);

    await jbController
      .connect(projectOwner)
      .mintTokensOf(
        PROJECT_ID, 
        RESERVED_AMOUNT, 
        ethers.constants.AddressZero, 
        MEMO, 
        PREFERED_CLAIMED_TOKEN, 
        /*reservedRate=*/10000
      );

    return {
      projectOwner,
      addrs,
      jbController,
      mockJbAllocator,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbToken,
      mockSplitsStore,
      mockJbProjects,
      timestamp,
    };
  }

  it(`Should send to beneficiaries and emit events if no allocator or project id is set in splits`, async function () {
    const { addrs, projectOwner, jbController, mockJbTokenStore, mockSplitsStore, timestamp } =
      await setup();
    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
    });

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await Promise.all(
      splitsBeneficiariesAddresses.map(async (beneficiary) => {
        await mockJbTokenStore.mock.mintFor
          .withArgs(
            beneficiary,
            PROJECT_ID,
            /*amount=*/Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
            PREFERED_CLAIMED_TOKEN,
          )
          .returns();
      }),
    );

    expect(
      await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO),
    ).to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    // Expect one event per split + one event for the whole transaction
    await Promise.all([
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
          .withArgs(
            /*fundingCycleConfiguration=*/ timestamp,
            /*fundingCycleNumber=*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.lockedUntil,
              split.beneficiary,
              split.allocator,
              split.projectId,
            ],
            /*count=*/ RESERVED_AMOUNT / splits.length,
            /*caller=*/ caller.address,
          );
      }),
      await expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
          /*fundingCycleConfiguration=*/ timestamp,
          /*fundingCycleNumber=*/ 1,
          PROJECT_ID,
          /*projectOwner=*/ projectOwner.address,
          /*count=*/ RESERVED_AMOUNT,
          /*leftoverTokenCount=*/ 0,
          MEMO,
          caller.address,
        ),
    ]);
  });

  it(`Should send to the project owner and emit events if project id is set in split, but not allocator`, async function () {
    const {
      addrs,
      projectOwner,
      jbController,
      mockJbTokenStore,
      mockSplitsStore,
      mockJbProjects,
      timestamp,
    } = await setup();
    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);
    const otherProjectId = 2;
    const otherProjectOwner = addrs[3];

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
      projectId: otherProjectId,
    });

    await mockJbProjects.mock.ownerOf.withArgs(otherProjectId).returns(otherProjectOwner.address);

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await mockJbTokenStore.mock.mintFor
      .withArgs(
        otherProjectOwner.address,
        PROJECT_ID,
        Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
        true,
      )
      .returns();

    expect(
      await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO),
    ).to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    await Promise.all([
      splits.map(async (split, _) => {
        await expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
          .withArgs(
            /*fundingCycleConfiguration=*/ timestamp,
            /*fundingCycleNumber=*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.lockedUntil,
              split.beneficiary,
              split.allocator,
              split.projectId,
            ],
            /*count=*/ RESERVED_AMOUNT / splits.length,
            /*caller=*/ caller.address,
          );
      }),
      await expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
          /*fundingCycleConfiguration=*/ timestamp,
          /*fundingCycleNumber=*/ 1,
          PROJECT_ID,
          /*projectOwner=*/ projectOwner.address,
          /*count=*/ RESERVED_AMOUNT,
          /*leftoverTokenCount=*/ 0,
          MEMO,
          caller.address,
        ),
    ]);
  });

  it(`Should send to the allocators and emit events if they are set in splits`, async function () {
    const {
      addrs,
      projectOwner,
      jbController,
      mockJbTokenStore,
      mockSplitsStore,
      mockJbAllocator,
      timestamp,
    } = await setup();
    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);
    const otherProjectId = 2;

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
      allocator: mockJbAllocator.address,
      projectId: otherProjectId,
    });

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await mockJbTokenStore.mock.mintFor
      .withArgs(
        mockJbAllocator.address,
        PROJECT_ID,
        /*amount=*/Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
        PREFERED_CLAIMED_TOKEN,
      )
      .returns();

    await Promise.all(
      splitsBeneficiariesAddresses.map(async (beneficiary) => {
        await mockJbAllocator.mock.allocate
          .withArgs(
            /*amount=*/Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
            /*group=*/RESERVED_SPLITS_GROUP,
            PROJECT_ID,
            otherProjectId,
            beneficiary,
            PREFERED_CLAIMED_TOKEN,
          )
          .returns();
      }),
    );

    expect(
      await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO),
    ).to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    await Promise.all([
      splits.map(async (split, _) => {
        await expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
          .withArgs(
            /*fundingCycleConfiguration=*/ timestamp,
            /*fundingCycleNumber=*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.lockedUntil,
              split.beneficiary,
              split.allocator,
              split.projectId,
            ],
            /*count=*/ RESERVED_AMOUNT / splits.length,
            /*caller=*/ caller.address,
          );
      }),
      await expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
          /*fundingCycleConfiguration=*/ timestamp,
          /*fundingCycleNumber=*/ 1,
          PROJECT_ID,
          /*projectOwner=*/ projectOwner.address,
          /*count=*/ RESERVED_AMOUNT,
          /*leftoverTokenCount=*/ 0,
          MEMO,
          caller.address,
        ),
    ]);
  });

  it(`Should send all left-over tokens to the project owner and emit events`, async function () {
    const { addrs, projectOwner, jbController, mockJbTokenStore, mockSplitsStore, timestamp } = await setup();
    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
      redemptionRate: 0,
    });

    splits[1].percent = 0; // A total of 50% is now allocated

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await mockJbTokenStore.mock.mintFor
      .withArgs(
        splitsBeneficiariesAddresses[0],
        PROJECT_ID,
        /*amount*/Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
        PREFERED_CLAIMED_TOKEN,
      )
      .returns();

    await mockJbTokenStore.mock.mintFor
      .withArgs(
        splitsBeneficiariesAddresses[1], 
        PROJECT_ID, 
        /*amount=*/0, 
        PREFERED_CLAIMED_TOKEN
      )
      .returns();

    await mockJbTokenStore.mock.mintFor
      .withArgs(
        projectOwner.address,
        PROJECT_ID,
        /*amount*/Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
        /*preferedClaimedToken=*/false,
      )
      .returns();

    expect(
      await jbController.connect(caller).callStatic.distributeReservedTokensOf(PROJECT_ID, MEMO),
    ).to.equal(RESERVED_AMOUNT);

    const tx = await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    // Expect one event per non-null split + one event for the whole transaction
    await Promise.all([
      await expect(tx)
        .to.emit(jbController, 'DistributeToReservedTokenSplit')
        .withArgs(
          /*fundingCycleConfiguration=*/ timestamp,
          /*fundingCycleNumber=*/ 1,
          PROJECT_ID,
          [
            splits[0].preferClaimed,
            splits[0].percent,
            splits[0].lockedUntil,
            splits[0].beneficiary,
            splits[0].allocator,
            splits[0].projectId,
          ],
          /*count=*/RESERVED_AMOUNT / splitsBeneficiariesAddresses.length,
          caller.address,
        ),
      await expect(tx)
        .to.emit(jbController, 'DistributeReservedTokens')
        .withArgs(
          /*fundingCycleConfiguration=*/ timestamp,
          /*fundingCycleNumber=*/1,
          PROJECT_ID,
          projectOwner.address,
          /*count=*/ RESERVED_AMOUNT,
          /*leftoverTokenCount=*/ RESERVED_AMOUNT / splitsBeneficiariesAddresses.length,
          MEMO,
          caller.address,
        ),
    ]);
  });

  it(`Should not revert and emit events if called with 0 tokens in reserve`, async function () {
    const { addrs, jbController, mockJbTokenStore, mockSplitsStore, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
    });

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    await Promise.all(
      splitsBeneficiariesAddresses.map(async (beneficiary) => {
        await mockJbTokenStore.mock.mintFor
          .withArgs(
            beneficiary,
            PROJECT_ID,
            /*amount*/ Math.floor(RESERVED_AMOUNT / splitsBeneficiariesAddresses.length),
            PREFERED_CLAIMED_TOKEN,
          )
          .returns();
      }),
    );

    await jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(RESERVED_AMOUNT);

    expect(
      await jbController.reservedTokenBalanceOf(PROJECT_ID, /*RESERVED_RATE=*/ 10000),
    ).to.equal(0);

    await expect(jbController.connect(caller).distributeReservedTokensOf(PROJECT_ID, MEMO)).to.be
      .not.reverted;
  });
});
