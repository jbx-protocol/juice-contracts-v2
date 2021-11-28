import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { abi as jbOperatorStoreAbi } from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import { abi as jbProjectsAbi } from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import { abi as jbDirectoryAbi } from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

const ZERO_ADDRESS = ethers.utils.hexZeroPad('0x', 20); // address(0)
const PROJECT_ID = 1;
const DOMAIN = 2;
const GROUP = 3;
let SET_SPLITS;

describe('JBSplitsStore::set(...)', function () {

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    SET_SPLITS = await jbOperations.SET_SPLITS();
  });


  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    // Override authentification (see jb_operator_store for auth tests)
    let mockOperatorStore = await deployMockContract(deployer, jbOperatorStoreAbi);
    let mockProjects = await deployMockContract(deployer, jbProjectsAbi);
    let mockDirectory = await deployMockContract(deployer, jbDirectoryAbi);

    // Override auth: by default projectOwner is controller + owner + has permission on SET_SPLITS
    await mockOperatorStore.mock.hasPermission
      .withArgs(projectOwner.address, projectOwner.address, PROJECT_ID, SET_SPLITS)
      .returns(true);

    await mockProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    let jbSplitsStoreFact = await ethers.getContractFactory('JBSplitsStore');
    let jbSplitsStore = await jbSplitsStoreFact.deploy(
      /*operator=*/mockOperatorStore.address,
      /*projects=*/mockProjects.address,
      /*directory=*/mockDirectory.address
    );

    let splits = createSplitArray(addrs[0].address, 4);

    return { deployer, projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockProjects, mockDirectory };
  }

  // Create array of JBSplit struct
  function createSplitArray(_benefAdress, n) {
    let splits = []
    for (let i = 0; i < n; i++) {
      splits.push({
        preferClaimed: false,
        percent: Math.floor(10000000 / n),
        lockedUntil: 0,
        beneficiary: _benefAdress,
        allocator: ZERO_ADDRESS,
        projectId: 0
      });
    }
    return splits;
  }

  // Expected behavior when no preexisting splits for this group - happy path
  it('set() and corresponding events', async function () {

    const { projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockDirectory } = await setup();

    // set(..) called from project owner address (which is set in setup() )
    await mockOperatorStore.mock.hasPermission.returns(false);
    await mockDirectory.mock.controllerOf.returns(addrs[0].address);

    const tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/splits
    );

    // Expect one event per split in splits[]
    await expect(tx)
      .to.emit(jbSplitsStore, 'SetSplit')
      .and.to.emit(jbSplitsStore, 'SetSplit')
      .and.to.emit(jbSplitsStore, 'SetSplit')
      .and.to.emit(jbSplitsStore, 'SetSplit')

    // Get the current splits (for this proj/dom/group)
    let splitsStored = await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);

    for (let idx = 0; idx < splits.length; idx++) {
      for (let split_key of Object.keys(splits[idx])) {
        expect(splitsStored[idx].split_key).to.equal(splits[idx].split_key);
      }
    }
  })

  // New splits[] when preexisting ones already exist without any lockedUntil
  it('New splits', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/splits
    );

    // 4 new ones, with a new beneficiary for each,
    let newBeneficiary = addrs[5].address;
    let newSplits = createSplitArray(newBeneficiary, 4);

    await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/newSplits
    );

    // Get the splits[] curently stored
    let splitsStored = await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);

    for (let idx = 0; idx < splits.length; idx++) {
      for (let split_key of Object.keys(newSplits[idx])) {
        expect(splitsStored[idx].split_key).to.equal(newSplits[idx].split_key);
      }
    }
  })


  it('New splits without including a preexisting locked one: revert', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = Date.now() + 3600000;
    let tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/splits
    );

    // Try to set 4 new ones, with a new beneficiary for each,
    // without the previous locked one
    let newBeneficiary = addrs[5].address;
    let newSplits = createSplitArray(newBeneficiary, 4);

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/PROJECT_ID,
        /*domain=*/DOMAIN,
        /*group=*/GROUP,
        /*splits[]=*/newSplits
      )
    ).to.be.revertedWith('0x0f: SOME_LOCKED');
  })


  it('New splits with extension of a preexisting locked one', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = Date.now() + 3600000;
    let tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/splits
    );

    // Try to set new ones, with lock extension
    let newSplits = createSplitArray(addrs[5].address, 4);

    // New lockedUntil = old lockedUntil + 3600 sec
    let newLockedTimestamp = Date.now() + 7200000
    newSplits[1].lockedUntil = newLockedTimestamp;
    newSplits[1].beneficiary = addrs[0].address;

    tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/newSplits
    );

    // Get the splits[] curently stored
    let splitsStored = await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);

    expect(splitsStored[1].lockedUntil).to.equal(newLockedTimestamp);
  })


  it('One split with a percent at 0: revert', async function () {
    const { projectOwner, jbSplitsStore, splits } = await setup();

    // Set one 0% split
    splits[1].percent = 0;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/PROJECT_ID,
        /*domain=*/DOMAIN,
        /*group=*/GROUP,
        /*splits[]=*/splits)
    ).to.be.revertedWith('0x10: BAD_SPLIT_PERCENT');
  })


  it('Allocator and beneficiary both equal to address(0): revert', async function () {
    const { projectOwner, jbSplitsStore, splits } = await setup();

    // Set both allocator and beneficiary as address(0)
    splits[1].beneficiary = ZERO_ADDRESS;
    splits[1].allocator = ZERO_ADDRESS;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/PROJECT_ID,
        /*domain=*/DOMAIN,
        /*group=*/GROUP,
        /*splits[]=*/splits)
    ).to.be.revertedWith('0x11: ZERO_ADDRESS');
  })


  it('Sum of the splits in percent > 10000000: revert', async function () {
    const { projectOwner, jbSplitsStore, splits } = await setup();

    // Set sum at 10000001
    splits[0].percent += 1;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/PROJECT_ID,
        /*domain=*/DOMAIN,
        /*group=*/GROUP,
        /*splits[]=*/splits)
    ).to.be.revertedWith('0x12: BAD_TOTAL_PERCENT');
  })

  // Auth challenges
  it('Not project owner but has permission', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockProjects, mockDirectory } = await setup();

    let caller = addrs[0];

    // Overriding the default permission from setup()
    await mockOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS)
      .returns(true);

    const tx = await jbSplitsStore.connect(caller).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/splits
    );

    await expect(tx)
      .to.emit(jbSplitsStore, 'SetSplit');
  })

  it('Not project owner and has no permission: revert', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockProjects, mockDirectory } = await setup();

    let caller = addrs[1];

    // Overriding the default permission from setup()
    await mockOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS)
      .returns(false);

    // Overriding the default permission from setup()
    await mockOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, SET_SPLITS)
      .returns(false);

    await expect(jbSplitsStore.connect(caller).set(
      /*projectId=*/PROJECT_ID,
      /*domain=*/DOMAIN,
      /*group=*/GROUP,
      /*splits[]=*/splits)
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  })
})