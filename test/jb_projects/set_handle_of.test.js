import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::setHandleOf(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const PROJECT_HANDLE_NOT_TAKEN = 'PROJECT_2';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = '';
  const PROJECT_ID = 1;

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
      jbProjectsStore,
    };
  }

  it('Should set new handle to project', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .setHandleOf(
        /*projectId=*/ PROJECT_ID,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(1);
    let storedProjectId = await jbProjectsStore.connect(deployer).idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));
    await expect(storedProjectId).to.equal(PROJECT_ID);

    await expect(tx)
      .to.emit(jbProjectsStore, 'SetHandle')
      .withArgs(
        PROJECT_ID,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
        projectOwner.address,
      );
  });

  it("Can't set if is empty handle", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(
          /*projectId=*/ PROJECT_ID,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY),
        ),
    ).to.be.revertedWith('0x08: EMPTY_HANDLE');
  });

  it("Can't set if handle taken already", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(
          /*projectId=*/ PROJECT_ID,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        ),
    ).to.be.revertedWith('0x09: HANDLE_TAKEN');
  });
});
