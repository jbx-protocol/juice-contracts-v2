import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';

describe('JBTokenStore::totalySupplyOf(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, projectOwner, newHolder, anotherHolder, ...addrs] =
      await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    const jbTokenStoreFactory = await ethers.getContractFactory('JBTokenStore');
    const jbTokenStore = await jbTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      controller,
      projectOwner,
      newHolder,
      anotherHolder,
      mockJbDirectory,
      mockJbProjects,
      jbTokenStore,
    };
  }

  it('Should return total supply of tokens for given projectId', async function () {
    const {
      controller,
      projectOwner,
      newHolder,
      anotherHolder,
      mockJbDirectory,
      mockJbProjects,
      jbTokenStore,
    } = await setup();

    // Mint access:
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // IssueFor access:
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await jbTokenStore.connect(projectOwner).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint unclaimed tokens
    const numTokens = 20;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* _preferClaimedTokens= */ false);

    // Mint claimed tokens for another holder
    await jbTokenStore
      .connect(controller)
      .mintFor(anotherHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ true);

    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens * 2);
  });

  it('Should return 0 if a token for projectId is not found', async function () {
    const { jbTokenStore } = await setup();

    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(0);
  });
});
