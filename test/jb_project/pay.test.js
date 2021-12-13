import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBProject::pay(...)', function () {
  const INITIAL_PROJECT_ID = 1;

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProject');
    let jbFakeProject = await jbFakeProjectFactory.deploy(INITIAL_PROJECT_ID, mockJbDirectory.address);

    return {
      deployer,
      addrs,
      mockJbDirectory,
      jbFakeProject
    };
  }

  it(`Should pay funds towards project`, async function () {
    // TODO(odd-amphora): implement.
  });

  it(`Fallback function should pay funds towards project`, async function () {
    // TODO(odd-amphora): implement.    
  });

  it(`Can't pay if project not found`, async function () {
    // TODO(odd-amphora): implement.    
  });

  it(`Can't pay if terminal not found`, async function () {
    // TODO(odd-amphora): implement.    
  });

});
