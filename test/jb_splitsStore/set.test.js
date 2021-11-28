import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import jbOperatorStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

const ZERO_ADDRESS = ethers.constants.AddressZero; // address(0)
const ONE_DAY = 3600000;

describe.only('JBSplitsStore::set(...)', function () {
  const PROJECT_ID = 1;
  const DOMAIN = 2;
  const GROUP = 3;
  let SET_SPLITS_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();
    SET_SPLITS_PERMISSION_INDEX = await jbOperations.SET_SPLITS();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockOperatorStore = await deployMockContract(deployer, jbOperatorStore.abi);
    let mockProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockDirectory = await deployMockContract(deployer, jbDirectory.abi);

    await mockOperatorStore.mock.hasPermission
      .withArgs(projectOwner.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(true);

    await mockProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    let jbSplitsStoreFact = await ethers.getContractFactory('JBSplitsStore');
    let jbSplitsStore = await jbSplitsStoreFact.deploy(
      mockOperatorStore.address,
      mockProjects.address,
      mockDirectory.address
    );

    let splits = createSplitArray(addrs[0].address, 4);

    return { deployer, projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockProjects, mockDirectory };
  }

  // Create array of JBSplit struct
  function createSplitArray(beneficiaryAddress, n) {
    let splits = []
    for (let i = 0; i < n; i++) {
      splits.push({
        preferClaimed: false,
        percent: Math.floor(10000000 / n),
        lockedUntil: 0,
        beneficiary: beneficiaryAddress,
        allocator: ZERO_ADDRESS,
        projectId: 0
      });
    }
    return splits;
  }

  it('set(...) and corresponding events', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockDirectory } = await setup();

    await mockOperatorStore.mock.hasPermission.returns(false);
    await mockDirectory.mock.controllerOf.returns(addrs[0].address);

    const tx = await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // Expect one event per split in splits[]
    await expect(tx)
      .to.emit(jbSplitsStore, 'SetSplit')
      .withArgs(PROJECT_ID, DOMAIN, GROUP, Object.values(splits[0]), projectOwner.address)
      .and.to.emit(jbSplitsStore, 'SetSplit')
      .withArgs(PROJECT_ID, DOMAIN, GROUP, Object.values(splits[1]), projectOwner.address)
      .and.to.emit(jbSplitsStore, 'SetSplit')
      .withArgs(PROJECT_ID, DOMAIN, GROUP, Object.values(splits[2]), projectOwner.address)
      .and.to.emit(jbSplitsStore, 'SetSplit')
      .withArgs(PROJECT_ID, DOMAIN, GROUP, Object.values(splits[3]), projectOwner.address)

    // Get the current splits (for this proj/dom/group)
    let splitsStored = await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);

    //compare every currently stored splits to the one we've just sent
    for (let [idx, split] of splitsStored) {
      for (let split_key of Object.keys(split)) {
        expect(split.split_key).to.equal(splits[idx].split_key);
      }
    }
  })

  it.only('Create and overwrite existing splits with same ID/Domain/Group', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // 4 new ones, with a new beneficiary for each,
    let newBeneficiary = addrs[5].address;
    let newSplits = createSplitArray(newBeneficiary, 4);

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      newSplits
    );

    // Get the splits[] curently stored
    let splitsStored = await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);

    //compare every currently stored splits to the one we've just sent
    for (let [idx, split] of splitsStored) {
      for (let splitKey of Object.keys(split)) {
        expect(split.splitKey).to.equal(splits[idx].splitKey);
      }
    }
  })


  it('New splits without including a preexisting locked one: revert', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = Date.now() + ONE_DAY;
    let tx = await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // Try to set 4 new ones, with a new beneficiary for each, without the previous locked one
    let newBeneficiary = addrs[5].address;
    let newSplits = createSplitArray(newBeneficiary, 4);

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        PROJECT_ID,
        DOMAIN,
        GROUP,
        newSplits
      )
    ).to.be.revertedWith('0x0f: SOME_LOCKED');
  })


  it('New splits with extension of a preexisting locked one', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = Date.now() + ONE_DAY;
    let tx = await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // Try to set new ones, with lock extension
    let newSplits = createSplitArray(addrs[5].address, 4);

    // New lockedUntil = old lockedUntil + 3600 sec
    let newLockedTimestamp = Date.now() + 2 * (ONE_DAY);
    newSplits[1].lockedUntil = newLockedTimestamp;
    newSplits[1].beneficiary = addrs[0].address;

    tx = await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      newSplits
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
        PROJECT_ID,
        DOMAIN,
        GROUP,
        splits)
    ).to.be.revertedWith('0x10: BAD_SPLIT_PERCENT');
  })


  it('Allocator and beneficiary both equal to address(0): revert', async function () {
    const { projectOwner, jbSplitsStore, splits } = await setup();

    // Set both allocator and beneficiary as address(0)
    splits[1].beneficiary = ZERO_ADDRESS;
    splits[1].allocator = ZERO_ADDRESS;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        PROJECT_ID,
        DOMAIN,
        GROUP,
        splits)
    ).to.be.revertedWith('0x11: ZERO_ADDRESS');
  })


  it('Sum of the splits in percent > 10000000: revert', async function () {
    const { projectOwner, jbSplitsStore, splits } = await setup();

    // Set sum at 10000001
    splits[0].percent += 1;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        PROJECT_ID,
        DOMAIN,
        GROUP,
        splits)
    ).to.be.revertedWith('0x12: BAD_TOTAL_PERCENT');
  })

  // Auth challenges
  it('Not project owner but has permission', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockProjects, mockDirectory } = await setup();

    let caller = addrs[0];

    // Overriding the default permission from setup()
    await mockOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(true);

    const tx = await jbSplitsStore.connect(caller).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    await expect(tx)
      .to.emit(jbSplitsStore, 'SetSplit');
  })

  it('Not project owner and has no permission: revert', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockOperatorStore, mockProjects, mockDirectory } = await setup();

    let caller = addrs[1];

    // Overriding the default permission from setup()
    await mockOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(false);

    // Overriding the default permission from setup()
    await mockOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, SET_SPLITS_PERMISSION_INDEX)
      .returns(false);

    await expect(jbSplitsStore.connect(caller).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits)
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  })
})