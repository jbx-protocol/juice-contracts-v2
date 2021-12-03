import { expect } from 'chai';
import { ethers } from 'hardhat';

import { fastForward } from '../helpers/utils';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::claimHandle(...)', function () {
  const PROJECT_HANDLE_1 = 'PROJECT_1';
  const PROJECT_HANDLE_2 = 'PROJECT_2';
  const PROJECT_HANDLE_3 = 'PROJECT_3';
  const METADATA_CID = '';
  const PROJECT_ID = 1;
  const PROJECT_ID_2 = 2;

  let jbOperatorStore;
  let CLAIM_HANDLE_PERMISSION_INDEX;

  beforeEach(async function () {
    let jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    CLAIM_HANDLE_PERMISSION_INDEX = await jbOperations.CLAIM_HANDLE();
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
      mockJbOperatorStore,
    };
  }

  it(`Should claim handle of a project`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ PROJECT_ID,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_3),
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .claimHandle(
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*address=*/ deployer.address,
        /*projectId=*/ PROJECT_ID_2,
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
        deployer.address,
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        deployer.address,
      );
  });

  it(`Can't claim if owner of project claims`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ PROJECT_ID,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .claimHandle(
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
          /*address=*/ projectOwner.address,
          /*projectId=*/ PROJECT_ID,
        ),
    ).to.be.revertedWith('0x0c: UNAUTHORIZED');
  });

  it(`Can't claim if it is wrong owner`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ PROJECT_ID,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_3),
      );

    await expect(
      jbProjectsStore
        .connect(projectOwner)
        .claimHandle(
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
          /*address=*/ deployer.address,
          /*projectId=*/ PROJECT_ID_2,
        ),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it(`Can't claim if it is after expiration date`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        /*metadataCid=*/ METADATA_CID,
      );

    await jbProjectsStore
      .connect(projectOwner)
      .transferHandleOf(
        /*projectId=*/ PROJECT_ID,
        /*address=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_3),
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .challengeHandle(/*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2));

    await fastForward(tx.blockNumber, ethers.BigNumber.from(12536000));

    await expect(
      jbProjectsStore
        .connect(deployer)
        .claimHandle(
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
          /*address=*/ deployer.address,
          /*projectId=*/ PROJECT_ID_2,
        ),
    ).to.be.revertedWith('0x0c: UNAUTHORIZED');
  });

  if (
    (`Can't claim handle and assign to inexistent or not owned projectId`,
    async function () {
      const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = setup();

      await jbProjectsStore
        .connect(deployer)
        .createFor(
          /*owner=*/ projectOwner.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
          /*metadataCid=*/ METADATA_CID,
        );

      let handleReceiver = addrs[0];
      await jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          /*projectId=*/ PROJECT_ID,
          /*address=*/ handleReceiver.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        );

      await mockJbOperatorStore.mock.hasPermission
        .withArgs(
          handleReceiver.address,
          deployer.address,
          PROJECT_ID,
          CLAIM_HANDLE_PERMISSION_INDEX,
        )
        .returns(true);

      await expect(
        jbProjectsStore
          .connect(handleReceiver)
          .claimHandle(
            /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
            /*address=*/ projectOwner.address,
            /*projectId=*/ PROJECT_ID_2,
          ),
      ).to.be.reverted;
    })
  );

  if (
    (`Can't claim handle even if its recipient who does it but without permissions`,
    async function () {
      const { projectOwner, deployer, addrs, jbProjectsStore, mockJbOperatorStore } = setup();

      await jbProjectsStore
        .connect(deployer)
        .createFor(
          /*owner=*/ projectOwner.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
          /*metadataCid=*/ METADATA_CID,
        );

      let handleReceiver = addrs[0];
      await jbProjectsStore
        .connect(projectOwner)
        .transferHandleOf(
          /*projectId=*/ PROJECT_ID,
          /*address=*/ handleReceiver.address,
          /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        );

      await mockJbOperatorStore.mock.hasPermission
        .withArgs(
          handleReceiver.address,
          deployer.address,
          PROJECT_ID,
          CLAIM_HANDLE_PERMISSION_INDEX,
        )
        .returns(false);

      await expect(
        jbProjectsStore
          .connect(handleReceiver)
          .claimHandle(
            /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
            /*address=*/ projectOwner.address,
            /*projectId=*/ PROJECT_ID_2,
          ),
      ).to.be.reverted;
    })
  );
});
