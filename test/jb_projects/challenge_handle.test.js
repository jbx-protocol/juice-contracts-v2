import { expect } from 'chai';
import { ethers } from 'hardhat';
import { getTimestamp } from '../helpers/utils';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::challengeHandle(...)', function () {
  const PROJECT_HANDLE_1 = 'PROJECT_1';
  const METADATA_CID = '';
  const PROJECT_ID_1 = 1;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
    };
  }

  it(`Should challenge handle successfully`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(addrs[0])
      .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1));

    let expectedChallengeExpiry = (await getTimestamp(tx.blockNumber)).add(31536000);
    let storedChallengeExpiryOf = await jbProjectsStore
      .connect(addrs[0])
      .challengeExpiryOf(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));
    await expect(storedChallengeExpiryOf).equal(expectedChallengeExpiry);

    await expect(tx)
      .to.emit(jbProjectsStore, 'ChallengeHandle')
      .withArgs(
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        PROJECT_ID_1,
        expectedChallengeExpiry,
        /*msg.sender=*/ addrs[0].address,
      );
  });

  it(`Can't challenge if inexistent projectId`, async function () {
    const { deployer, jbProjectsStore } = await setup();

    await expect(
      jbProjectsStore
        .connect(deployer)
        .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1)),
    ).to.be.revertedWith('0x0d: HANDLE_NOT_TAKEN');
  });

  it(`Can't challenge if a handle that has been challenged before`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(deployer)
      .challengeHandle(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));

    await expect(
      jbProjectsStore
        .connect(deployer)
        .challengeHandle(ethers.utils.formatBytes32String(PROJECT_HANDLE_1)),
    ).to.be.revertedWith('0x0e: CHALLENGE_OPEN');
  });
});
