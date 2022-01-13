import { assert, expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::setChallengePeriodSource(...)', function () {
  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);

    let jbChallengePeriodSourceFactory = await ethers.getContractFactory('JB1YearChallengePeriodSource');
    let jbChallengePeriodSource = await jbChallengePeriodSourceFactory.deploy();

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(
      mockJbOperatorStore.address,
      jbChallengePeriodSource.address,
      deployer.address
    );

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
      jbChallengePeriodSourceFactory,
      jbChallengePeriodSource,
    };
  }

  it(`Should switch challengePeriodSource`, async function () {
    const { deployer, jbProjectsStore, jbChallengePeriodSourceFactory, jbChallengePeriodSource } = await setup();

    assert.equal(await jbProjectsStore.challengePeriodSource(), jbChallengePeriodSource.address);

    let jbChallengePeriodSource2 = await jbChallengePeriodSourceFactory.deploy();
    assert.notEqual(jbChallengePeriodSource.address, jbChallengePeriodSource2.address);

    let tx = await jbProjectsStore
      .connect(deployer)
      .setChallengePeriodSource(jbChallengePeriodSource2.address)

    assert.equal(await jbProjectsStore.challengePeriodSource(), jbChallengePeriodSource2.address);

    await expect(tx)
      .to.emit(jbProjectsStore, 'NewChallengePeriodSource')
      .withArgs(
        jbChallengePeriodSource2.address
      );
  });

  it(`Should only allow owner to call`, async function () {
    const { addrs, jbProjectsStore, jbChallengePeriodSourceFactory, jbChallengePeriodSource } = await setup();

    assert.equal(await jbProjectsStore.challengePeriodSource(), jbChallengePeriodSource.address);

    let jbChallengePeriodSource2 = await jbChallengePeriodSourceFactory.deploy();
    assert.notEqual(jbChallengePeriodSource.address, jbChallengePeriodSource2.address);

    await expect(
      jbProjectsStore
        .connect(addrs[0])
        .setChallengePeriodSource(jbChallengePeriodSource2.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
