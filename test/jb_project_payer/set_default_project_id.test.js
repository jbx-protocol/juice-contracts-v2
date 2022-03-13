import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBProjectPayer::setDefaultProjectId(...)', function () {
  const INITIAL_PROJECT_ID = 1;

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProjectPayer');
    let jbFakeProjectPayer = await jbFakeProjectFactory.deploy(
      INITIAL_PROJECT_ID,
      mockJbDirectory.address,
    );

    return {
      deployer,
      addrs,
      mockJbDirectory,
      jbFakeProjectPayer,
    };
  }

  it(`Should set project id if owner`, async function () {
    const { deployer, jbFakeProjectPayer } = await setup();

    expect(await jbFakeProjectPayer.connect(deployer).defaultProjectId()).to.equal(
      INITIAL_PROJECT_ID,
    );

    let newId = INITIAL_PROJECT_ID + 1;
    const setDefaultProjectTx = await jbFakeProjectPayer
      .connect(deployer)
      .setDefaultProjectId(newId);

    expect(await jbFakeProjectPayer.connect(deployer).defaultProjectId()).to.equal(newId);

    await expect(setDefaultProjectTx)
      .to.emit(jbFakeProjectPayer, 'SetDefaultProjectId')
      .withArgs(newId, deployer.address);
  });

  it(`Can't set project id if not owner`, async function () {
    const { addrs, jbFakeProjectPayer } = await setup();

    await expect(
      jbFakeProjectPayer.connect(addrs[0]).setDefaultProjectId(INITIAL_PROJECT_ID + 1),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
