import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::createFor(...)', function () {
  const METADATA_CID = 'QmThsKQpFBQicz3t3SU9rRz3GV81cwjnWsBBLxzznRNvpa';
  const PROJECT_ID_1 = 1;
  const PROJECT_ID_2 = 2;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    let jbOperatorStore = await jbOperatorStoreFactory.deploy();

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
    };
  }

  it(`Should create a project and emit Create`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        METADATA_CID,
      );

    let storedMetadataCid = await jbProjectsStore.connect(deployer).metadataCidOf(PROJECT_ID_1);

    await expect(storedMetadataCid).to.equal(METADATA_CID);

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_1,
        projectOwner.address,
        METADATA_CID,
        deployer.address,
      );
  });

  it(`Should create two projects and count to be 2 and emit Create`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        METADATA_CID,
      );

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_2,
        projectOwner.address,
        METADATA_CID,
        deployer.address,
      );
  });
});
