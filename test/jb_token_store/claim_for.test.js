import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import errors from '../helpers/errors.json';

describe('JBTokenStore::claimFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, newHolder] = await ethers.getSigners();

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
      newHolder,
      mockJbDirectory,
      jbTokenStore,
    };
  }

  it('Should claim tokens and emit event', async function () {
    const { controller, newHolder, mockJbDirectory, jbTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint more unclaimed tokens
    const numTokens = 20;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ false);

    const amountToClaim = numTokens - 1;

    // Claim the unclaimed tokens
    const claimForTx = await jbTokenStore
      .connect(controller)
      .claimFor(newHolder.address, PROJECT_ID, amountToClaim);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(
      numTokens - amountToClaim,
    );
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens);

    await expect(claimForTx)
      .to.emit(jbTokenStore, 'Claim')
      .withArgs(newHolder.address, PROJECT_ID, numTokens, amountToClaim, controller.address);
  });

  it(`Can't claim tokens if projectId isn't found`, async function () {
    const { newHolder, jbTokenStore } = await setup();
    const numTokens = 1;

    await expect(
      jbTokenStore.claimFor(newHolder.address, PROJECT_ID, numTokens),
    ).to.be.revertedWith(errors.TOKEN_NOT_FOUND);
  });

  it(`Can't claim more tokens than the current _unclaimedBalance`, async function () {
    const { controller, newHolder, mockJbDirectory, jbTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint more unclaimed tokens
    const numTokens = 10000;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ false);

    await expect(
      jbTokenStore.claimFor(newHolder.address, PROJECT_ID, numTokens + 1),
    ).to.be.revertedWith(errors.INSUFFICIENT_UNCLAIMED_TOKENS);
  });
});
