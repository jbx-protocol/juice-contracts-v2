import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::renewHandle(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
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

  it("Doesn't renew handle of project from non owner", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore.connect(projectOwner).renewHandleOf(/*projectId=*/ 1),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it('Should renew handle', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    let tx = await jbProjectsStore.connect(projectOwner).renewHandleOf(/*projectId=*/ 1);

    await expect(tx)
      .to.emit(jbProjectsStore, 'RenewHandle')
      .withArgs(ethers.utils.formatBytes32String(PROJECT_HANDLE), 1, projectOwner.address);
  });
});
