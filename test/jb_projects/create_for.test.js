import { expect } from 'chai';
import { ethers } from 'hardhat';
import errors from '../helpers/errors.json';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbChallengePeriodSource from '../../artifacts/contracts/JB1YearChallengePeriodSource.sol/JB1YearChallengePeriodSource.json';

describe('JBProjects::createFor(...)', function () {
  const PROJECT_HANDLE_1 = 'PROJECT_1';
  const PROJECT_HANDLE_2 = 'PROJECT_2';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = 'QmThsKQpFBQicz3t3SU9rRz3GV81cwjnWsBBLxzznRNvpa';
  const PROJECT_ID_1 = 1;
  const PROJECT_ID_2 = 2;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    let jbOperatorStore = await jbOperatorStoreFactory.deploy();

    let mockJbChallengePeriodSource = await deployMockContract(deployer, jbChallengePeriodSource.abi);

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(
      jbOperatorStore.address,
      mockJbChallengePeriodSource.address,
      deployer.address
    );

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
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID_1);
    let storedProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));
    let storedMetadataCid = await jbProjectsStore.connect(deployer).metadataCidOf(PROJECT_ID_1);

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));
    await expect(storedProjectId).to.equal(PROJECT_ID_1);
    await expect(storedMetadataCid).to.equal(METADATA_CID);

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_1,
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
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
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        METADATA_CID,
      );

    let storedId1 = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));
    let storedId2 = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_2));

    await expect(storedId1).to.equal(PROJECT_ID_1);
    await expect(storedId2).to.equal(PROJECT_ID_2);

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        2,
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        METADATA_CID,
        deployer.address,
      );
  });

  it(`Can't create project if has an empty handle`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await expect(
      jbProjectsStore
        .connect(deployer)
        .createFor(
          projectOwner.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY),
          METADATA_CID,
        ),
    ).to.be.revertedWith(errors.HANDLE_EMPTY);
  });

  it(`Can't create if handle taken already`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(deployer)
        .createFor(
          projectOwner.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
          METADATA_CID,
        ),
    ).to.be.revertedWith(errors.HANDLE_TAKEN);
  });
});
