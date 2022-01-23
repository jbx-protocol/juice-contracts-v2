import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbTokenUriResolver from '../../artifacts/contracts/interfaces/IJBTokenUriResolver.sol/IJBTokenUriResolver.json';

describe('JBProjects::setTokenUriResolver(...)', function () {
  async function setup() {
    let [deployer] = await ethers.getSigners();

    let mockJbTokenUriResolver = await deployMockContract(deployer, jbTokenUriResolver.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjects = await jbProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      deployer,
      jbProjects,
      mockJbTokenUriResolver,
    };
  }

  it(`Should set the tokenUri resolver and emit event, if called by the contract owner`, async function () {
    const { deployer, jbProjects, mockJbTokenUriResolver } = await setup();

    expect(await jbProjects
      .connect(deployer)
      .setTokenUriResolver(mockJbTokenUriResolver.address)
      )
      .to.emit(jbProjects, 'SetJBTokenUriResolver')
      .withArgs(mockJbTokenUriResolver.address);

    expect(await jbProjects.JBTokenUriResolver()).to.equal(mockJbTokenUriResolver.address);

  });
});
