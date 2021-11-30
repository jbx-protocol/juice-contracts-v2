import { expect } from 'chai';
import { ethers } from 'hardhat';
import { getTimestampFn } from '../helpers/utils'

describe('JBProjects::challengeHandle(...)', function () {

  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let jbProjectsFactory;
  let jbProjectsStore;

  let deployer;
  let projectOwner;
  let addrs;

  let projectHandle = "PROJECT_1";
  let projectHandleNotTaken = "PROJECT_2"
  let projectHandleNotTaken2 = "PROJECT_3"
  let metadataCid = "";

  beforeEach(async function () {
    [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);
  });

  // Working on these now

  it('Challenging an inexistent projectId', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ metadataCid,
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
      )

    await expect(
      jbProjectsStore
        .connect(deployer)
        .challengeHandle(
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken2)
        ),
    ).to.be.revertedWith('0x0d: HANDLE_NOT_TAKEN');
  });

  it('Challenging a handle that has been challenged before', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ metadataCid,
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
      )

    await jbProjectsStore
      .connect(deployer)
      .challengeHandle(
        /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
      )

    await expect(
      jbProjectsStore
        .connect(deployer)
        .challengeHandle(
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
        ),
    ).to.be.revertedWith('0x0e: CHALLENGE_OPEN');
  });

  // TODO:  Fix this in the protocol.Currently the Protocol allows the 
  //        challenge to happen from the owner of the project that has 
  //        the handle challenged.
  //
  // it('Challenging a handle by the owner of the project', async function () {

  //   await jbProjectsStore
  //     .connect(deployer)
  //     .createFor(
  //       /*owner=*/ projectOwner.address,
  //       /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
  //       /*metadataCid=*/ metadataCid,
  //     )

  //   await jbProjectsStore
  //     .connect(projectOwner)
  //     .transferHandleOf(
  //         /*projectId=*/ 1,
  //         /*address=*/ deployer.address,
  //         /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
  //     )

  //   await expect(
  //     jbProjectsStore
  //       .connect(projectOwner)
  //       .challengeHandle(
  //         /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
  //       ),
  //   ).to.be.revertedWith('0x0e: CHALLENGE_OPEN');
  // });

  it('Should challenge handle successfully', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken2),
        /*metadataCid=*/ "",
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
      )

    let tx = await jbProjectsStore
      .connect(deployer)
      .challengeHandle(
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken),
      )

    let expectedChallengeExpiry = (await getTimestampFn(tx.blockNumber)).add(31536000)

    await expect(tx)
      .to.emit(jbProjectsStore, 'ChallengeHandle')
      .withArgs(ethers.utils.formatBytes32String(projectHandleNotTaken), 1, expectedChallengeExpiry, deployer.address)
  });

})