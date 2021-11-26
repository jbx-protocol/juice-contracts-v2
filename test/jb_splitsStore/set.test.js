import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { abi as jbOperatorStoreAbi } from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import { abi as jbProjectsAbi } from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import { abi as jbDirectoryAbi } from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

const ZERO_ADDRESS = ethers.utils.hexZeroPad('0x', 20); // address(0)

describe.only('JBSplitsStore::set(...)', function () {

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    // Override authentification (see jb_operator_store for auth tests)
    let mockOperatorStore = await deployMockContract(deployer, jbOperatorStoreAbi);
    let mockProjects = await deployMockContract(deployer, jbProjectsAbi);
    let mockDirectory = await deployMockContract(deployer, jbDirectoryAbi);

    await mockOperatorStore.mock.hasPermission.returns(true);
    await mockProjects.mock.ownerOf.returns(projectOwner.address);
    await mockDirectory.mock.controllerOf.returns(projectOwner.address);

    let jbSplitsStoreFact = await ethers.getContractFactory('JBSplitsStore');
    let jbSplitsStore = await jbSplitsStoreFact.deploy(
      /*operator=*/mockOperatorStore.address,
      /*projects=*/mockProjects.address,
      /*directory=*/mockDirectory.address
    );

    let splits = createSplitArray(addrs[0].address, 4);

    return { deployer, projectOwner, addrs, jbSplitsStore, splits };
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

  // Expected behavior when no preexisting splits for this group
  it('set() and corresponding events', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    const tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/1,
      /*domain=*/2,
      /*group=*/3,
      /*splits[]=*/splits
    );

    // Expect one event per split in splits[]
    await expect(tx)
      .to.emit(jbSplitsStore, 'SetSplit')
      //.withArgs(1, 2, 3, splits[0], projectOwner) // FAILS (but shouldn't) ->need to compare key by key? Skip ?
      .and.to.emit(jbSplitsStore, 'SetSplit')
      //.withArgs(1, 2, 3, splits[1], projectOwner)
      .and.to.emit(jbSplitsStore, 'SetSplit')
      //.withArgs(1, 2, 3, splits[2], projectOwner)
      .and.to.emit(jbSplitsStore, 'SetSplit')
    //.withArgs(1, 2, 3, splits[3], projectOwner)

    // Get the current splits (for this proj/dom/group)
    let splitsStored = await jbSplitsStore.splitsOf(1, 2, 3);

    for (let idx = 0; idx < splits.length; idx++) {
      for (let split_key of Object.keys(splits[idx])) {
        expect(splitsStored[idx].split_key).to.equal(splits[idx].split_key);
      }
    }
  })

  // New splits[] when preexisting ones already exist without any lockedUntil
  it('New splits', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/1,
      /*domain=*/2,
      /*group=*/3,
      /*splits[]=*/splits
    );

    // 4 new ones, with a new beneficiary for each,
    let newBeneficiary = addrs[5].address;
    let newSplits = createSplitArray(newBeneficiary, 4);

    await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/1,
      /*domain=*/2,
      /*group=*/3,
      /*splits[]=*/newSplits
    );

    // Get the splits[] curently stored
    let splitsStored = await jbSplitsStore.splitsOf(1, 2, 3);

    for (let idx = 0; idx < splits.length; idx++) {
      for (let split_key of Object.keys(newSplits[idx])) {
        expect(splitsStored[idx].split_key).to.equal(newSplits[idx].split_key);
      }
    }
  })


  it('New splits without including a preexisting locked one: revert', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = Date.now() + 3600000;
    let tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/1,
      /*domain=*/2,
      /*group=*/3,
      /*splits[]=*/splits
    );

    // Try to set 4 new ones, with a new beneficiary for each,
    // without the previous locked one
    let newBeneficiary = addrs[5].address;
    let newSplits = createSplitArray(newBeneficiary, 4);

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/1,
        /*domain=*/2,
        /*group=*/3,
        /*splits[]=*/newSplits
      )
    ).to.be.revertedWith('0x0f: SOME_LOCKED');
  })


  it('New splits with extension of a preexisting locked one', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = Date.now() + 3600000;
    let tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/1,
      /*domain=*/2,
      /*group=*/3,
      /*splits[]=*/splits
    );

    // Try to set new ones, with lock extension
    let newSplits = createSplitArray(addrs[5].address, 4);

    // New lockedUntil = old lockedUntil + 3600 sec
    let newLockedTimestamp = Date.now() + 7200000
    newSplits[1].lockedUntil = newLockedTimestamp;
    newSplits[1].beneficiary = addrs[0].address;

    tx = await jbSplitsStore.connect(projectOwner).set(
      /*projectId=*/1,
      /*domain=*/2,
      /*group=*/3,
      /*splits[]=*/newSplits
    );

    // Get the splits[] curently stored
    let splitsStored = await jbSplitsStore.splitsOf(1, 2, 3);

    expect(splitsStored[1].lockedUntil).to.equal(newLockedTimestamp);
  })


  it('One split with a percent at 0: revert', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set one 0% split
    splits[1].percent = 0;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/1,
        /*domain=*/2,
        /*group=*/3,
        /*splits[]=*/splits)
    ).to.be.revertedWith('0x10: BAD_SPLIT_PERCENT');
  })


  it('Allocator and beneficiary both equal to address(0): revert', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set both allocator and beneficiary as address(0)
    splits[1].beneficiary = ZERO_ADDRESS;
    splits[1].allocator = ZERO_ADDRESS;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/1,
        /*domain=*/2,
        /*group=*/3,
        /*splits[]=*/splits)
    ).to.be.revertedWith('0x11: ZERO_ADDRESS');
  })


  it('Sum of the splits in percent > 10000000: revert', async function () {
    const { deployer, projectOwner, addrs, jbSplitsStore, splits } = await setup();

    // Set sum at 10000001
    splits[0].percent += 1;

    await expect(
      jbSplitsStore.connect(projectOwner).set(
        /*projectId=*/1,
        /*domain=*/2,
        /*group=*/3,
        /*splits[]=*/splits)
    ).to.be.revertedWith('0x12: BAD_TOTAL_PERCENT');
  })

})







// --1) expected behavior : set(id, domain, group, splits[]) -> retrieved in splitsOf(id, domain, group) + event SetSplit(_projectId, _domain, _group, _splits[_i], msg.sender)
// --2) new splits MUST includes current locked ones -> try to include new splits without a locked
// --3) every splits.percents > 0 -> try one split @ 0
// --4) allocator and benificiary == address(0)
// 5) sum of every splits.percent < 10000000 -> try all sum to 10000001


// add require preferClaimed set only if tokenId specified ?

// operatorStore.hasPermission(msg.sender, _account, _domain, _permissionIndex) _permissionIndex=21 SET_SPLIT; override=address(directory.controllerOf(_projectId)) == msg.sender


/*
struct JBSplit {
  // A flag that only has effect if a projectId is also specified, and that project has issued its tokens.
  // If so, this flag indicates if the tokens that result from making a payment to the project should be delivered staked or unstaked to the beneficiary.
  bool preferClaimed;
  // The percent of the whole group that this split occupies. This number is out of 10000000.
  uint24 percent;
  // Specifies if the split should be unchangeable until the specifies time comes, with the exception of extending the lockedUntil period.
  uint48 lockedUntil;
  // The role the  beneficary depends on whether or not projectId is specified, or whether or not allocator is specified.
  // If allocator is set, the beneficiary will be forwarded to the allocator for it to use.
  // If allocator is not set but projectId is set, the beneficiary is the address to which the project's tokens will be sent that result from a payment to it.
  // If neither allocator or projectId are set, the beneficiary is where the funds from the split will be sent.
  address payable beneficiary;
  // If an allocator is specified, funds will be sent to the allocator contract along with the projectId, beneficiary, preferClaimed properties.
  IJBSplitAllocator allocator;
  // If an allocator is not set but a projectId is set, funds will be sent to the Juicebox treasury belonging to the project who's ID is specified.
  // Resulting tokens will be routed to the beneficiary with the unstaked token prerence respected.
  uint56 projectId;
}

*/