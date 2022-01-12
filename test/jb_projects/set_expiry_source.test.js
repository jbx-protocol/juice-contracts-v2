import { assert, expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::setExpirySource(...)', function () {
  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);

    let jbExpirySourceFactory = await ethers.getContractFactory('JBExpirySource');
    let jbExpirySource = await jbExpirySourceFactory.deploy();

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(
      mockJbOperatorStore.address,
      jbExpirySource.address,
      deployer.address
    );

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
      jbExpirySourceFactory,
      jbExpirySource,
    };
  }

  it(`Should switch expirySource`, async function () {
    const { deployer, jbProjectsStore, jbExpirySourceFactory, jbExpirySource } = await setup();

    assert.equal(await jbProjectsStore.expirySource(), jbExpirySource.address);

    let jbExpirySource2 = await jbExpirySourceFactory.deploy();
    assert.notEqual(jbExpirySource.address, jbExpirySource2.address);

    let tx = await jbProjectsStore
      .connect(deployer)
      .setExpirySource(jbExpirySource2.address)

    assert.equal(await jbProjectsStore.expirySource(), jbExpirySource2.address);

    await expect(tx)
      .to.emit(jbProjectsStore, 'NewExpirySource')
      .withArgs(
        jbExpirySource2.address
      );
  });

  it(`Should only allow owner to call`, async function () {
    const { addrs, jbProjectsStore, jbExpirySourceFactory, jbExpirySource } = await setup();

    assert.equal(await jbProjectsStore.expirySource(), jbExpirySource.address);

    let jbExpirySource2 = await jbExpirySourceFactory.deploy();
    assert.notEqual(jbExpirySource.address, jbExpirySource2.address);

    await expect(
      jbProjectsStore
        .connect(addrs[0])
        .setExpirySource(jbExpirySource2.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
