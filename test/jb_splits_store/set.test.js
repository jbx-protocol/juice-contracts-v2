import { expect } from 'chai';
import { ethers } from 'hardhat';
import { daysFromNow, daysFromDate, dateInSeconds } from '../helpers/utils';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import jbOperatorStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBSplitsStore::set(...)', function () {
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

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatorStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(projectOwner.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(true);

    await mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    let jbSplitsStoreFact = await ethers.getContractFactory('JBSplitsStore');
    let jbSplitsStore = await jbSplitsStoreFact.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address
    );

    let splits = makeSplits(addrs[0].address);

    return { deployer, projectOwner, addrs, jbSplitsStore, splits, mockJbOperatorStore, mockJbProjects, mockJbDirectory };
  }

  function makeSplits(beneficiaryAddress, count=4) {
    let splits = []
    for (let i = 0; i < count; i++) {
      splits.push({
        preferClaimed: false,
        percent: Math.floor(10000000 / count),
        lockedUntil: 0,
        beneficiary: beneficiaryAddress,
        allocator: ethers.constants.AddressZero,
        projectId: 0
      });
    }
    return splits;
  }

  function cleanSplits(splits) {
    let cleanedSplits = []
    for (let split of splits) {
      cleanedSplits.push({
        preferClaimed: split[0],
        percent: split[1],
        lockedUntil: split[2],
        beneficiary: split[3],
        allocator: split[4],
        projectId: split[5].toNumber()
      })
    }
    return cleanedSplits;
  }

  it('Should set splits with beneficiaries and emit events if project owner', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockJbOperatorStore, mockJbDirectory } = await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    const tx = await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // Expect one event per split
    await Promise.all(
      splits.map(async (split, _) => {
        await expect(tx)
          .to.emit(jbSplitsStore, 'SetSplit')
          .withArgs(PROJECT_ID, DOMAIN, GROUP, Object.values(split), projectOwner.address);
      }),
    );

    let splitsStored = cleanSplits(await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(splits);
  })

  it('Should set splits with allocators set', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockJbOperatorStore, mockJbDirectory } = await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    const newSplits = splits.map((elt) => ({
      ...elt,
      beneficiary: ethers.constants.AddressZero,
      allocator: addrs[5].address,
    }));

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      newSplits
    );

    let splitsStored = cleanSplits(await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(newSplits);
  })

  it('Should set splits with allocators and beneficiaries set', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockJbOperatorStore, mockJbDirectory } = await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    const newSplits = splits.map((elt) => ({
      ...elt,
      beneficiary: addrs[5].address,
      allocator: addrs[5].address,
    }));

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      newSplits
    );

    let splitsStored = cleanSplits(await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(newSplits);
  })

  it('Should set new splits when overwriting existing splits with the same ID/Domain/Group', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    let newBeneficiary = addrs[5].address;
    let newSplits = makeSplits(newBeneficiary);

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      newSplits
    );

    let splitsStored = cleanSplits(await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(newSplits);
  })

  it('Can\'t set new splits without including a preexisting locked one', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = dateInSeconds(daysFromNow(1));
    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // New splits without the previous locked one
    let newBeneficiary = addrs[5].address;
    let newSplits = makeSplits(newBeneficiary);

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        PROJECT_ID,
        DOMAIN,
        GROUP,
        newSplits
      )
    ).to.be.revertedWith('0x0f: SOME_LOCKED');
  })

  it('Should set new splits with extension of a preexisting locked one', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits } = await setup();

    let lockDate = daysFromNow(1);

    // Set one locked split
    splits[1].lockedUntil = dateInSeconds(lockDate);
    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    );

    // Try to set new ones, with lock extension of one day
    let newLockDate = dateInSeconds(daysFromDate(lockDate, 1));
    let newSplits = makeSplits(addrs[5].address);

    newSplits[1].lockedUntil = newLockDate;
    newSplits[1].beneficiary = addrs[0].address;

    await jbSplitsStore.connect(projectOwner).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      newSplits
    );

    let splitsStored = await jbSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);
    expect(splitsStored[1].lockedUntil).to.equal(newLockDate);
  })

  it('Can\'t set splits when a split has a percent of 0', async function () {
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

  it('Can\'t set splits when a split has both allocator and beneficiary zero address', async function () {
    const { projectOwner, jbSplitsStore, splits } = await setup();

    splits[1].beneficiary = ethers.constants.AddressZero;
    splits[1].allocator = ethers.constants.AddressZero;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        PROJECT_ID,
        DOMAIN,
        GROUP,
        splits)
    ).to.be.revertedWith('0x11: ZERO_ADDRESS');
  })

  it('Can\'t set splits if the sum of the percents is greather than 10000000', async function () {
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

  it('Should set splits if not the project owner but has permission', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockJbOperatorStore, mockJbProjects, mockJbDirectory } = await setup();

    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(true);

    await expect(jbSplitsStore.connect(caller).set(
      PROJECT_ID,
      DOMAIN,
      GROUP,
      splits
    )).to.be.not.reverted;
  })

  it('Can\'t set splits if not project owner and doesn\'t have permission', async function () {
    const { projectOwner, addrs, jbSplitsStore, splits, mockJbOperatorStore, mockJbProjects, mockJbDirectory } = await setup();

    let caller = addrs[1];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
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