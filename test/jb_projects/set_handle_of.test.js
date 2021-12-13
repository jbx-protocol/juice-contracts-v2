import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::setHandleOf(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const PROJECT_HANDLE_NOT_TAKEN = 'PROJECT_2';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = '';
  const PROJECT_ID_1 = 1;

  let SET_HANDLE_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    SET_HANDLE_PERMISSION_INDEX = await jbOperations.SET_HANDLE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    let jbOperatorStore = await jbOperatorStoreFactory.deploy();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
      mockJbOperatorStore,
    };
  }

  it(`Should set new handle to project and emit SetHandle`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .setHandleOf(PROJECT_ID_1, ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(1);
    let storedProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN));
    await expect(storedProjectId).to.equal(PROJECT_ID_1);

    await expect(tx)
      .to.emit(jbProjectsStore, 'SetHandle')
      .withArgs(
        PROJECT_ID_1,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_NOT_TAKEN),
        projectOwner.address,
      );
  });

  it(`Can't set if is empty handle`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .setHandleOf(PROJECT_ID_1, ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY)),
    ).to.be.revertedWith('EMPTY_HANDLE()');
  });

  // it(`Can't set if handle taken already`, async function () {
  //   const { projectOwner, deployer, jbProjectsStore } = await setup();

  //   await jbProjectsStore
  //     .connect(deployer)
  //     .createFor(
  //       projectOwner.address,
  //       ethers.utils.formatBytes32String(PROJECT_HANDLE),
  //       METADATA_CID,
  //     );

  //   await expect(
  //     jbProjectsStore
  //       .connect(projectOwner)
  //       .setHandleOf(PROJECT_ID_1, ethers.utils.formatBytes32String(PROJECT_HANDLE)),
  //   ).to.be.revertedWith('HANDLE_TAKEN()');
  // });

  it(`Can't set handle if not owner of project`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(addrs[0])
        .setHandleOf(PROJECT_ID_1, ethers.utils.formatBytes32String(PROJECT_HANDLE)),
    ).to.be.reverted;
  });

  it(`Can't set handle if not owner even with permissions`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE),
        METADATA_CID,
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(addrs[0].address, deployer.address, PROJECT_ID_1, SET_HANDLE_PERMISSION_INDEX)
      .returns(true);

    await expect(
      jbProjectsStore
        .connect(addrs[0])
        .setHandleOf(PROJECT_ID_1, ethers.utils.formatBytes32String(PROJECT_HANDLE)),
    ).to.be.reverted;
  });
});
