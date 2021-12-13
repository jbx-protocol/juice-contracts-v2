import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBProject::pay(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const TOKEN = ethers.Wallet.createRandom().address;
  const TERMINAL = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MEMO = 'memo';

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProject');
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

  it(`Should pay funds towards project`, async function () {
    // TODO(odd-amphora): implement.
  });

  it(`Fallback function should pay funds towards project`, async function () {
    // TODO(odd-amphora): implement.
  });

  it(`Can't pay if project not found`, async function () {
    const { jbFakeProject } = await setup();

    // Set project id to zero.
    await jbFakeProject.setProjectId(0);

    await expect(
      jbFakeProject.pay(
        BENEFICIARY,
        MEMO,
        PREFER_CLAIMED_TOKENS,
        TOKEN,
      ),
    ).to.be.revertedWith('JuiceboxProject::_pay: PROJECT_NOT_FOUND');
  });

  it(`Can't pay if terminal not found`, async function () {
    const { jbFakeProject, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(
        INITIAL_PROJECT_ID,
        TOKEN
      )
      .returns(ethers.constants.AddressZero);

    await expect(
      jbFakeProject.pay(
        BENEFICIARY,
        MEMO,
        PREFER_CLAIMED_TOKENS,
        TOKEN,
      ),
    ).to.be.revertedWith('JuiceboxProject::_pay: TERMINAL_NOT_FOUND');
  });
});
