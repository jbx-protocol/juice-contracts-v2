import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::createFor(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const PROJECT_HANDLE_NOT_TAKEN = 'PROJECT_2';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = '';
  const PROJECT_ID = 1;
  const PROJECT_ID_2 = 2;

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

  it('Should create a project', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID);
    let storedProjectId = await jbProjectsStore.connect(deployer).idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE));
    let storedMetadataCid = await jbProjectsStore.connect(deployer).metadataCidOf(PROJECT_ID);

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE));
    await expect(storedProjectId).to.equal(PROJECT_ID);
    await expect(storedMetadataCid).to.equal(METADATA_CID);

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID,
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        METADATA_CID,
        deployer.address,
      );
  });

  it('Should create two projects and count to be 2', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
        /*metadataCid=*/ METADATA_CID,
      );

    let storedId1 = await jbProjectsStore.connect(deployer).idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE))
    let storedId2 = await jbProjectsStore.connect(deployer).idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN))

    await expect(storedId1).to.equal(PROJECT_ID);
    await expect(storedId2).to.equal(PROJECT_ID_2);

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        2,
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
        METADATA_CID,
        deployer.address,
      );
  });

  it("Can't create project if has an empty handle", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .createFor(
          /*owner=*/ projectOwner.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY),
          /*metadataCid=*/ METADATA_CID,
        ),
    ).to.be.revertedWith('0x06: EMPTY_HANDLE');
  });

  it("Can't create if handle taken already", async function () {
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
        .connect(deployer)
        .createFor(
          /*owner=*/ projectOwner.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
          /*metadataCid=*/ METADATA_CID,
        ),
    ).to.be.revertedWith('0x07: HANDLE_TAKEN');
  });
});
