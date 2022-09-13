import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../helpers/utils';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import errors from '../helpers/errors.json';

describe('JBTokenStore::transferFrom(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, holder, recipient, projectOwner] = await ethers.getSigners();

    const jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    const jbOperations = await jbOperationsFactory.deploy();

    const TRANSFER_INDEX = await jbOperations.TRANSFER();

    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);
    const mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const jbTokenStoreFactory = await ethers.getContractFactory('JBTokenStore');
    const jbTokenStore = await jbTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
    );

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    await mockJbFundingCycleStore.mock.currentOf.returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({
        global: {
          pauseTransfer: 0,
        }
      }),
    });

    return {
      controller,
      holder,
      recipient,
      projectOwner,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      jbTokenStore,
      TRANSFER_INDEX,
    };
  }

  it('Should transfer unclaimed tokens and emit event if caller has permission', async function () {
    const {
      controller,
      holder,
      recipient,
      projectOwner,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      jbTokenStore,
      TRANSFER_INDEX,
    } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    await mockJbFundingCycleStore.mock.currentOf.returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({
        global: {
          pauseTransfer: 0,
        }
      }),
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // IssueFor access:
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    // Issue tokens for project
    await jbTokenStore.connect(projectOwner).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint unclaimed tokens
    const numTokens = 20;
    await jbTokenStore.connect(controller).mintFor(holder.address, PROJECT_ID, numTokens, false);

    // Transfer unclaimed tokens to new recipient
    const transferFromTx = await jbTokenStore
      .connect(controller)
      .transferFrom(
        /* sender */ holder.address,
        PROJECT_ID,
        /* recipient */ recipient.address,
        numTokens,
      );

    expect(await jbTokenStore.unclaimedBalanceOf(holder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.unclaimedBalanceOf(recipient.address, PROJECT_ID)).to.equal(
      numTokens,
    );

    await expect(transferFromTx)
      .to.emit(jbTokenStore, 'Transfer')
      .withArgs(holder.address, PROJECT_ID, recipient.address, numTokens, controller.address);
  });

  it('Cannot transfer unclaimed tokens if transfers are paused', async function () {
    const {
      controller,
      holder,
      recipient,
      projectOwner,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      jbTokenStore,
      TRANSFER_INDEX,
    } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    await mockJbFundingCycleStore.mock.currentOf.returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({
        global: {
          pauseTransfer: 1,
        }
      }),
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // IssueFor access:
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    // Issue tokens for project
    await jbTokenStore.connect(projectOwner).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint unclaimed tokens
    const numTokens = 20;
    await jbTokenStore.connect(controller).mintFor(holder.address, PROJECT_ID, numTokens, false);

    // Transfer unclaimed tokens to new recipient
    await expect(
      jbTokenStore
        .connect(controller)
        .transferFrom(
          /* sender */ holder.address,
          PROJECT_ID,
          /* recipient */ recipient.address,
          numTokens,
        ),
    ).to.be.revertedWith(errors.TRANSFERS_PAUSED);
  });

  it(`Can't transfer unclaimed tokens to zero address`, async function () {
    const {
      controller,
      holder,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      jbTokenStore,
      TRANSFER_INDEX,
    } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    await mockJbFundingCycleStore.mock.currentOf.returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({
        global: {
          pauseTransfer: 0,
        }
      }),
    });

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    await expect(
      jbTokenStore
        .connect(controller)
        .transferFrom(
          holder.address,
          PROJECT_ID,
          /* recipient */ ethers.constants.AddressZero,
          /* amount= */ 1,
        ),
    ).to.be.revertedWith(errors.RECIPIENT_ZERO_ADDRESS);
  });

  it(`Can't transfer more unclaimed tokens than available balance`, async function () {
    const {
      controller,
      holder,
      recipient,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      jbTokenStore,
      TRANSFER_INDEX,
    } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    await mockJbFundingCycleStore.mock.currentOf.returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({
        global: {
          pauseTransfer: 0,
        }
      }),
    });

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    // 0 unclaimed tokens available, try to transfer 1
    await expect(
      jbTokenStore
        .connect(controller)
        .transferFrom(
          /* sender */ holder.address,
          PROJECT_ID,
          /* recipient */ recipient.address,
          /* amount= */ 1,
        ),
    ).to.be.revertedWith(errors.INSUFFICIENT_UNCLAIMED_TOKENS);
  });

  it(`Can't transfer unclaimed tokens if caller lacks permission`, async function () {
    const {
      controller,
      holder,
      recipient,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      jbTokenStore,
      TRANSFER_INDEX,
    } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    await mockJbFundingCycleStore.mock.currentOf.returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({
        global: {
          pauseTransfer: 0,
        }
      }),
    });

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(false);

    await expect(
      jbTokenStore
        .connect(controller)
        .transferFrom(
          /* sender */ holder.address,
          PROJECT_ID,
          /* recipient */ recipient.address,
          /* amount= */ 1,
        ),
    ).to.be.reverted;
  });
});
