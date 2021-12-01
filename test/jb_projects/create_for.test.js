import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::createFor(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = '';

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

  it("Doesn't create project if has an empty handle", async function () {
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

  it("Doesn't create if handle taken already", async function () {
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

  it('Should create a project', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        1,
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        METADATA_CID,
        deployer.address,
      );
  });
});
