import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::transferHandleOf(...)', function () {
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

  it("Doesn't transfer handle if is empty handle", async function () {
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
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY),
        ),
    ).to.be.revertedWith('0x0a: EMPTY_HANDLE');
  });

  it("Doesn't transfer handle if handle taken already", async function () {
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
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        ),
    ).to.be.revertedWith('0x0b: HANDLE_TAKEN');
  });

  it('Should transfer handle to another address', async function () {
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
      .transferHandleOf(
        /*projectId=*/ 1,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID);
    let storedProjectId = await jbProjectsStore.connect(deployer).idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));
    let storedOldProjectId = await jbProjectsStore.connect(deployer).idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE));

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));
    await expect(storedProjectId).to.equal(PROJECT_ID);
    await expect(storedOldProjectId).to.equal(0);

    await expect(tx)
      .to.emit(jbProjectsStore, 'TransferHandle')
      .withArgs(
        1,
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
        projectOwner.address,
      );
  });
});
