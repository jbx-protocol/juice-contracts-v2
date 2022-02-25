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
    let jbFakeProject = await jbFakeProjectFactory.deploy(
      INITIAL_PROJECT_ID,
      mockJbDirectory.address,
    );

    return {
      deployer,
      addrs,
      mockJbDirectory,
      jbFakeProject,
    };
  }

  it(`Should set project id if owner`, async function () {
    const { deployer, jbFakeProject } = await setup();

    expect(await jbFakeProject.connect(deployer).defaultProjectId()).to.equal(INITIAL_PROJECT_ID);

    let newId = INITIAL_PROJECT_ID + 1;
    await jbFakeProject.connect(deployer).setDefaultProjectId(newId);

    expect(await jbFakeProject.connect(deployer).defaultProjectId()).to.equal(newId);
  });

  it(`Can't set project id if not owner`, async function () {
    const { addrs, jbFakeProject } = await setup();

    await expect(
      jbFakeProject.connect(addrs[0]).setDefaultProjectId(INITIAL_PROJECT_ID + 1),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
