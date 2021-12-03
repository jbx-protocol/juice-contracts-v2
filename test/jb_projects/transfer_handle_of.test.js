import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::transferHandleOf(...)', function () {
  const PROJECT_HANDLE_1 = 'PROJECT_1';
  const PROJECT_HANDLE_2 = 'PROJECT_2';
  const PROJECT_HANDLE_EMPTY = '';
  const METADATA_CID = '';
  const PROJECT_ID = 1;

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

  it(`Should transfer handle to another address`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ 1,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID);
    let storedProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_2));
    let storedOldProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));

    await expect(storedHandle).to.equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_2));
    await expect(storedProjectId).to.equal(PROJECT_ID);
    await expect(storedOldProjectId).to.equal(0);

    await expect(tx)
      .to.emit(jbProjectsStore, 'TransferHandle')
      .withArgs(
        1,
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
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
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

  it(`Can't transfer handle if handle taken already`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        ),
    ).to.be.revertedWith('0x0b: HANDLE_TAKEN');
  });

  it(`Can't transfer handle if not owner of project`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(addrs[0])
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        ),
    ).to.be.reverted;
  });

  it(`Can't transfer handle if operator even with permissions`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await expect(
      jbProjectsStore
        .connect(deployer)
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        ),
    ).to.be.reverted;
  });

  it(`Can't transfer handle if operator even with permissions`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(deployer.address, projectOwner.address, PROJECT_ID, SET_HANDLE_PERMISSION_INDEX)
      .returns(true);

    await expect(
      jbProjectsStore
        .connect(deployer)
        .transferHandleOf(
          /*projectId=*/ 1,
          /*address=*/ deployer.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        ),
    ).to.be.reverted;
  });
});