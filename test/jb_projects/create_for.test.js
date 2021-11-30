import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::createFor(...)', function () {

  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let jbProjectsFactory;
  let jbProjectsStore;

  let deployer;
  let projectOwner;
  let addrs;

  let projectHandle = "PROJECT_1";
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
    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .createFor(
          /*owner=*/ projectOwner.address,
          /*handle=*/ ethers.utils.formatBytes32String(emptyProjectHandle),
          /*metadataCid=*/ "",
        ),
    ).to.be.revertedWith('0x06: EMPTY_HANDLE');
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
        .connect(deployer)
        .createFor(
          /*owner=*/ projectOwner.address,
          /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
          /*metadataCid=*/ "",
        ),
    ).to.be.revertedWith('0x07: HANDLE_TAKEN');
  });

  it('Should create a project', async function () {

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ metadataCid,
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(1, projectOwner.address, ethers.utils.formatBytes32String(projectHandle), metadataCid, deployer.address)
  });


})