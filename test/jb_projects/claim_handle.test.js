import { expect } from 'chai';
import { ethers } from 'hardhat';

import { fastForward, getTimestamp } from '../helpers/utils';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import errors from '../helpers/errors.json';

describe('JBProjects::claimHandle(...)', function () {
  const PROJECT_HANDLE_1 = 'PROJECT_1';
  const PROJECT_HANDLE_2 = 'PROJECT_2';
  const PROJECT_HANDLE_3 = 'PROJECT_3';
  const METADATA_CID = '';
  const PROJECT_ID_1 = 1;
  const PROJECT_ID_2 = 2;

  let CLAIM_HANDLE_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    CLAIM_HANDLE_PERMISSION_INDEX = await jbOperations.CLAIM_HANDLE();
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

  it(`Should claim handle of a project and emit ClaimHandle`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        PROJECT_ID_1,
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_3),
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .claimHandle(
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        deployer.address,
        PROJECT_ID_2,
      );

    let storedId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));
    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID_2);

    await expect(storedId).equal(PROJECT_ID_2);
    await expect(storedHandle).equal(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));

    await expect(tx)
      .to.emit(jbProjectsStore, 'ClaimHandle')
      .withArgs(
        PROJECT_ID_2,
        /*transferAddress=*/ deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*msg.sender=*/ deployer.address,
      );
  });

  it(`Can claim handle as operator with permissions given by transferRecepient`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    let handleReceiver = addrs[0];
    let operator = addrs[1];

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        handleReceiver.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_3),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        PROJECT_ID_1,
        handleReceiver.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        operator.address,
        handleReceiver.address,
        PROJECT_ID_2,
        CLAIM_HANDLE_PERMISSION_INDEX,
      )
      .returns(true);

    let tx = await jbProjectsStore
      .connect(operator)
      .claimHandle(
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        handleReceiver.address,
        PROJECT_ID_2,
      );

    await expect(tx)
      .to.emit(jbProjectsStore, 'ClaimHandle')
      .withArgs(
        PROJECT_ID_2,
        /*transferAddress=*/ handleReceiver.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*msg.sender=*/ operator.address,
      );
  });

  it(`Can't claim if owner of project claims`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        PROJECT_ID_1,
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .claimHandle(
          ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
          projectOwner.address,
          PROJECT_ID_1,
        ),
    ).to.be.revertedWith(errors.TRANSFER_HANDLE_UNAUTHORIZED);
  });

  it(`Can't claim if it is after expiration date`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        PROJECT_ID_1,
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_3),
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .challengeHandle(ethers.utils.formatBytes32String(PROJECT_HANDLE_2));

    await fastForward(tx.blockNumber, ethers.BigNumber.from(12536000));

    await expect(
      jbProjectsStore
        .connect(deployer)
        .claimHandle(
          ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
          deployer.address,
          PROJECT_ID_2,
        ),
    ).to.be.revertedWith(errors.TRANSFER_HANDLE_UNAUTHORIZED);
  });

  it(`Can't claim handle and assign to inexistent or not owned projectId`, async function () {
    const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        METADATA_CID,
      );

    let handleReceiver = addrs[0];
    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        PROJECT_ID_1,
        handleReceiver.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        handleReceiver.address,
        deployer.address,
        PROJECT_ID_1,
        CLAIM_HANDLE_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(
      jbProjectsStore
        .connect(handleReceiver)
        .claimHandle(
          ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
          projectOwner.address,
          PROJECT_ID_2,
        ),
    ).to.be.reverted;
  });
});
