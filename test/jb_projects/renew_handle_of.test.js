import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::renewHandle(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
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

  it('Should renew handle', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    let tx = await jbProjectsStore.connect(projectOwner).renewHandleOf(/*projectId=*/ PROJECT_ID);

    let storedChallengeExpiryOf = await jbProjectsStore.connect(deployer).challengeExpiryOf(ethers.utils.formatBytes32String(PROJECT_HANDLE));
    await expect(storedChallengeExpiryOf).equal(0);

    await expect(tx)
      .to.emit(jbProjectsStore, 'RenewHandle')
      .withArgs(ethers.utils.formatBytes32String(PROJECT_HANDLE), PROJECT_ID, projectOwner.address);
  });

  it("Can't renew handle of project from non owner", async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore.connect(projectOwner).renewHandleOf(/*projectId=*/ PROJECT_ID),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });
});
