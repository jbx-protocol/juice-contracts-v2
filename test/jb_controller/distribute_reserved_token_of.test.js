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

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);
    let mockTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    let mockSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockToken = await deployMockContract(deployer, jbToken.abi);
    let mockJbAllocator = await deployMockContract(deployer, jbAllocator.abi);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    await mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, projectOwner.address)
      .returns(false);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ reservedRate: 10000 })
    });

    // No token has been distributed/minted since the reserved rate is 100
    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(0);

    await jbController.connect(projectOwner).mintTokensOf(PROJECT_ID, RESERVED_AMOUNT, ethers.constants.AddressZero, MEMO, /*_preferClaimedTokens=*/true, 10000)

    return {
      projectOwner,
      addrs,
      jbController,
      mockJbAllocator,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      mockSplitsStore,
      timestamp
    };
  }

  it.only(`Should send to the splits without allocator or project id set`, async function () {
    const { addrs, projectOwner, jbController, mockJbFundingCycleStore, mockTokenStore, mockSplitsStore, timestamp } = await setup();

    const caller = addrs[0];
    const splitsBeneficiariesAddresses = [addrs[1], addrs[2]].map((signer) => signer.address);
    //const splitsBeneficiariesAddresses = [addrs[1].address];

    const splits = makeSplits({
      count: 2,
      beneficiary: splitsBeneficiariesAddresses,
      preferClaimed: true,
    })

    await mockSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, RESERVED_SPLITS_GROUP)
      .returns(splits);

    //console.log("splitsstore " + mockSplitsStore.address);
    //console.log("tokenstore " + mockTokenStore.address);
    //console.log("benef " + splitsBeneficiariesAddresses);
    //console.log("reserved " + await jbController.reservedTokenBalanceOf(PROJECT_ID, 10000));
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

    // Expect one event per split + one event for the whole transaction
    await Promise.all([
      splits.map(async (split, _) => {
        await expect(tx)
          .to.emit(jbController, 'DistributeToReservedTokenSplit')
        /*
        Still not fixed in 12/2021: https://github.com/EthWorks/Waffle/issues/245
        .withArgs(
          timestamp,
          1,
          PROJECT_ID,
          split,
          RESERVED_AMOUNT / splits.length,
          caller.address)
        */
      }),
      await expect(tx)
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

  it(`Should substract the received amount to the reserved tokens if reserved rate is 0%`, async function () {
    const { projectOwner, beneficiary, jbController, mockJbFundingCycleStore, mockTokenStore, timestamp } = await setup();

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
      metadata: packFundingCycleMetadata({ reservedRate: 0 })
    });

    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(RESERVED_AMOUNT); // to mint == to receive <=> reserve rate = 0

    await mockTokenStore.mock.mintFor
      .withArgs(beneficiary.address, PROJECT_ID, RESERVED_AMOUNT, true)
      .returns(); // to mint == to receive (reserve rate = 0)

    let previousReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, /*reservedRate=*/0);

    await expect(jbController.connect(projectOwner).mintTokensOf(PROJECT_ID, RESERVED_AMOUNT, beneficiary.address, MEMO, /*_preferClaimedTokens=*/true, 0))
      .to.emit(jbController, 'MintTokens')
      .withArgs(beneficiary.address, PROJECT_ID, RESERVED_AMOUNT, MEMO, 0, projectOwner.address);

    let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, 0);

    // reserved token cannot be < 0
    expect(newReservedTokenBalance).to.equal(Math.max(previousReservedTokenBalance.sub(RESERVED_AMOUNT), 0));
  });

  it(`Should send to the project owner if project if is set`, async function () {
  });

  it(`Should send according to the splits if project if is set`, async function () {
  });



  // allocator

  // projtectId

  // splits: everything distributed in splits

  // splits with leftover -> send to project owner


});