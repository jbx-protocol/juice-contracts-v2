import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::transferHandleOf(...)', function () {

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

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ metadataCid,
      )

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(emptyProjectHandle)
        ),
    ).to.be.revertedWith('0x0a: EMPTY_HANDLE');
  });

  it('Handle taken already', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandle)
        ),
    ).to.be.revertedWith('0x0b: HANDLE_TAKEN');
  });

  it('Should transfer handle to another address', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'TransferHandle')
      .withArgs(1, deployer.address, ethers.utils.formatBytes32String(projectHandle), ethers.utils.formatBytes32String(projectHandleNotTaken), projectOwner.address)
  });


})