import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import errors from '../helpers/errors.json';

describe('JBProjects::transferHandleOf(...)', function () {
  const PROJECT_HANDLE_1 = 'PROJECT_1';
  const PROJECT_HANDLE_2 = 'PROJECT_2';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = '';
  const METADATA_DOMAIN = 1234;
  const PROJECT_ID_1 = 1;

  let SET_HANDLE_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    SET_HANDLE_PERMISSION_INDEX = await jbOperations.SET_HANDLE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
      mockJbOperatorStore,
    };
  }

  it(`Should transfer handle to another address and emit TransferHandle`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ]
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        PROJECT_ID_1,
        /*address=*/ deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID_1);
    let storedProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_2));
    let storedOldProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_2));
    await expect(storedProjectId).to.equal(PROJECT_ID_1);
    await expect(storedOldProjectId).to.equal(0);

    await expect(tx)
      .to.emit(jbProjectsStore, 'TransferHandle')
      .withArgs(
        PROJECT_ID_1,
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        projectOwner.address,
      );
  });

  it(`Can't transfer handle if is empty handle`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ]
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          PROJECT_ID_1,
          deployer.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_EMPTY),
        ),
    ).to.be.revertedWith(errors.HANDLE_EMPTY);
  });

  it(`Can't transfer handle if handle taken already`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ]
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          PROJECT_ID_1,
          deployer.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        ),
    ).to.be.revertedWith(errors.HANDLE_TAKEN);
  });

  it(`Can't transfer handle if not owner of project`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ]
      );

    await expect(
      jbProjectsStore
        .connect(addrs[0])
        .transferHandleOf(
          PROJECT_ID_1,
          deployer.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        ),
    ).to.be.reverted;
  });

  it(`Can't transfer handle if operator even without permissions`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ]
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(deployer.address, projectOwner.address, PROJECT_ID_1, SET_HANDLE_PERMISSION_INDEX)
      .returns(false);

    await expect(
      jbProjectsStore
        .connect(deployer)
        .transferHandleOf(
          PROJECT_ID_1,
          deployer.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        ),
    ).to.be.reverted;
  });
});
