import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBProject::fundTreasury(...)', function () {
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

  it(`Should fund project treasury`, async function () {
    // TODO(odd-amphora): implement.
  });

  it(`Can't fund if project not found`, async function () {
    // TODO(odd-amphora): implement.    
  });

  it(`Can't fund if terminal not found`, async function () {
    // TODO(odd-amphora): implement.    
  });

  it(`Can't fund if insufficient funds`, async function () {
    // TODO(odd-amphora): implement.    
  });

});
