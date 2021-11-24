import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from "../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json";
import jbProjects from "../../artifacts/contracts/JBProjects.sol/JBProjects.json";

describe('JBDirectory::addTerminals(...)', function () {

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);

    let jbDirectoryFactory = await ethers.getContractFactory('JBDirectory');
    let jbDirectory = await jbDirectoryFactory.deploy(mockJbOperatorStore.address, mockJbProjects.address);

    return { deployer, addrs, mockJbOperatorStore, mockJbProjects, jbDirectory };
  }

  it('hello world', async function () {
    const { deployer } = await setup();
  });

});
