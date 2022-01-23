import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::createFor(...)', function () {
  const METADATA_CID = 'QmThsKQpFBQicz3t3SU9rRz3GV81cwjnWsBBLxzznRNvpa';
  const METADATA_DOMAIN = 1234;
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
<<<<<<< HEAD
        METADATA_CID,
      );

    let storedMetadataCid = await jbProjectsStore.connect(deployer).metadataCidOf(PROJECT_ID_1);
=======
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ]
      );

    let storedHandle = await jbProjectsStore.connect(deployer).handleOf(PROJECT_ID_1);
    let storedProjectId = await jbProjectsStore
      .connect(deployer)
      .idFor(ethers.utils.formatBytes32String(PROJECT_HANDLE_1));
    let storedMetadataCid = await jbProjectsStore.connect(deployer).metadataCidOf(PROJECT_ID_1, METADATA_DOMAIN);
>>>>>>> main

    await expect(storedMetadataCid).to.equal(METADATA_CID);

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_1,
        projectOwner.address,
<<<<<<< HEAD
        METADATA_CID,
=======
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ],
>>>>>>> main
        deployer.address,
      );
  });

  it(`Should create two projects and count to be 2 and emit Create`, async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
<<<<<<< HEAD
        METADATA_CID,
=======
        ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ],
>>>>>>> main
      );

    let tx = await jbProjectsStore
      .connect(deployer)
      .createFor(
        projectOwner.address,
<<<<<<< HEAD
        METADATA_CID,
=======
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ],
>>>>>>> main
      );

    await expect(tx)
      .to.emit(jbProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_2,
        projectOwner.address,
<<<<<<< HEAD
        METADATA_CID,
        deployer.address,
      );
  });
=======
        ethers.utils.formatBytes32String(PROJECT_HANDLE_2),
        [
          METADATA_CID,
          METADATA_DOMAIN
        ],
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
          [
            METADATA_CID,
            METADATA_DOMAIN
          ],
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
        [
          METADATA_CID,
          METADATA_DOMAIN
        ],
      );

    await expect(
      jbProjectsStore
        .connect(deployer)
        .createFor(
          projectOwner.address,
          ethers.utils.formatBytes32String(PROJECT_HANDLE_1),
          [
            METADATA_CID,
            METADATA_DOMAIN
          ],
        ),
    ).to.be.revertedWith(errors.HANDLE_TAKEN);
  });
>>>>>>> main
});
