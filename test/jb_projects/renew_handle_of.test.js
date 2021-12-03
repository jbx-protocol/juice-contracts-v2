import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::renewHandle(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const METADATA_CID = '';
  const PROJECT_ID = 1;

  let jbOperatorStore;
  let RENEW_HANDLE_PERMISSION_INDEX;

  beforeEach(async function () {
    let jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    RENEW_HANDLE_PERMISSION_INDEX = await jbOperations.RENEW_HANDLE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
      mockJbOperatorStore
    };
  }

  it(`Should renew handle`, async function () {
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

  it(`Can't renew handle of project from non owner`, async function () {
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

  it(`Can't renew handle of project operator with no permissions`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore.connect(deployer).renewHandleOf(/*projectId=*/ PROJECT_ID),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it(`Can't renew handle of non owner with no permissions`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore.connect(addrs[0]).renewHandleOf(/*projectId=*/ PROJECT_ID),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it(`Can't renew handle of non owner even with permissions`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(addrs[0].address, deployer.address, PROJECT_ID, RENEW_HANDLE_PERMISSION_INDEX)
      .returns(true);


    await expect(
      jbProjectsStore.connect(addrs[0]).renewHandleOf(/*projectId=*/ PROJECT_ID),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });
});
