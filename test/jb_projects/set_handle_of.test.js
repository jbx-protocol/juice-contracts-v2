import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::setHandleOf(...)', function () {

  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let jbProjectsFactory;
  let jbProjectsStore;

  let deployer;
  let projectOwner;
  let addrs;

  let projectHandle = "PROJECT_1";
  let projectHandleNotTaken = "PROJECT_2"
  let emptyProjectHandle = "";
  let metadataCid = "";

  beforeEach(async function () {
    [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);
  });

  it('Has an empty handle', async function () {

    const projectId = await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ metadataCid,
      )

    const response = await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(
          /*projectId=*/ 1,
          /*handle=*/ ethers.utils.formatBytes32String(emptyProjectHandle)
        ),
    ).to.be.revertedWith('0x08: EMPTY_HANDLE');
  });


  it('Handle taken already', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    const response = await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(
          /*projectId=*/ 1,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandle)
        ),
    ).to.be.revertedWith('0x09: HANDLE_TAKEN');
  });

  it('Should set new handle to project', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .setHandleOf(
          /*projectId=*/ 1,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'SetHandle')
      .withArgs(1, ethers.utils.formatBytes32String(projectHandleNotTaken), projectOwner.address)
  });


})