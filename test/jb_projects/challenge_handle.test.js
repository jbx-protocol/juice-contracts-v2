import { expect } from 'chai';
import { ethers } from 'hardhat';
import { getTimestamp } from '../helpers/utils';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::challengeHandle(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const PROJECT_HANDLE_NOT_TAKEN = 'PROJECT_2';
  const PROJECT_HANDLE_NOT_TAKEN_2 = 'PROJECT_3';
  const METADATA_CID = '';

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

  it("Doesn't challenge if inexistent projectId", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*METADATA_CID=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ 1,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
      );

    await expect(
      jbProjectsStore
        .connect(deployer)
        .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN_2)),
    ).to.be.revertedWith('0x0d: HANDLE_NOT_TAKEN');
  });

  it("Doesn't challenge if a handle that has been challenged before", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ 1,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
      );

    await jbProjectsStore
      .connect(deployer)
      .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));

    await expect(
      jbProjectsStore
        .connect(deployer)
        .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)),
    ).to.be.revertedWith('0x0e: CHALLENGE_OPEN');
  });

  // TODO:  Fix this in the protocol.Currently the Protocol allows the
  //        challenge to happen from the owner of the project that has
  //        the handle challenged.
  //
  // it('Doesn\'t challenge if it is the owner of the project', async function () {
  //  const { projectOwner, deployer, jbProjectsStore } = await setup();

  //   await jbProjectsStore
  //     .connect(deployer)
  //     .createFor(
  //       /*owner=*/ projectOwner.address,
  //       /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
  //       /*metadataCid=*/ METADATA_CID,
  //     )

  //   await jbProjectsStore
  //     .connect(projectOwner)
  //     .transferHandleOf(
  //         /*projectId=*/ 1,
  //         /*address=*/ deployer.address,
  //         /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
  //     )

  //   await expect(
  //     jbProjectsStore
  //       .connect(projectOwner)
  //       .challengeHandle(
  //         /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
  //       ),
  //   ).to.be.revertedWith('0x0e: CHALLENGE_OPEN');
  // });

  it('Should challenge handle successfully', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ '',
      );

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN_2),
        /*metadataCid=*/ '',
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ 1,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));

    let expectedChallengeExpiry = (await getTimestamp(tx.blockNumber)).add(31536000);

    await expect(tx)
      .to.emit(jbProjectsStore, 'ChallengeHandle')
      .withArgs(
        ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
        1,
        expectedChallengeExpiry,
        deployer.address,
      );
  });
});
