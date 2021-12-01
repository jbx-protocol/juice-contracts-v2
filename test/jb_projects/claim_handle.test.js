import { expect } from 'chai';
import { ethers } from 'hardhat';

import { fastForward } from '../helpers/utils';

describe('JBProjects::claimHandle(...)', function () {
  const PROJECT_HANDLE = "PROJECT_1";
  const PROJECT_HANDLE_NOT_TAKEN = "PROJECT_2";
  const PROJECT_HANDLE_NOT_TAKEN_2 = "PROJECT_3";
  const METADATA_CID = "";

  let jbOperatorStore;

  beforeEach(async function () {
    let jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore
    };
  };

  it('Should reject with Unauthorized', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
      )

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .claimHandle(
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
          /*address=*/ projectOwner.address,
          /*projectId=*/ 1,
        ),
    ).to.be.revertedWith('0x0c: UNAUTHORIZED');
  });

  it('Claim handle from another project with wrong owner', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN_2),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
      )

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .claimHandle(
            /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
            /*address=*/ deployer.address,
            /*projectId=*/ 2,
        ),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it('Claim handle from another project after expiration date', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN_2),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
      )

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .challengeHandle(
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
      )

    await fastForward(tx.blockNumber, ethers.BigNumber.from(12536000))

    await expect(
      jbProjectsStore
        .connect(deployer)
        .claimHandle(
            /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
            /*address=*/ deployer.address,
            /*projectId=*/ 2,
        ),
    ).to.be.revertedWith('0x0c: UNAUTHORIZED');
  });

  it('Should claim handle from another project', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN_2),
        /*metadataCid=*/ METADATA_CID,
      )

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
      )

    let tx = await jbProjectsStore
      .connect(deployer)
      .claimHandle(
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
          /*address=*/ deployer.address,
          /*projectId=*/ 2,
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'ClaimHandle')
      .withArgs(2, deployer.address, ethers.utils.formatBytes32String(PROJECT_HANDLE), deployer.address)
  });

})