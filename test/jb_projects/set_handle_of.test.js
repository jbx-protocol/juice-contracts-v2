import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::setHandleOf(...)', function () {

  const PROJECT_HANDLE = "PROJECT_1";
  const PROJECT_HANDLE_NOT_TAKEN = "PROJECT_2";
  const PROJECT_HANDLE_EMPTY = "";
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

  it('Has an empty handle', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(
          /*projectId=*/ 1,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY)
        ),
    ).to.be.revertedWith('0x08: EMPTY_HANDLE');
  });


  it('Handle taken already', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(
          /*projectId=*/ 1,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE)
        ),
    ).to.be.revertedWith('0x09: HANDLE_TAKEN');
  });

  it('Should set new handle to project', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      )

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .setHandleOf(
          /*projectId=*/ 1,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN)
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'SetHandle')
      .withArgs(1, ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN), projectOwner.address)
  });


})