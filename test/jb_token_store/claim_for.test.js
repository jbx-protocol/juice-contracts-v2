import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';

describe('JBTokenStore::claimFor(...)', function () {
  const PROJECT_ID = 2;
  const name = 'TestTokenDAO';
  const symbol = 'TEST';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();

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
      addrs,
      mockJbDirectory,
      jbTokenStore,
    };
  }

  it('Should claim tokens and emit event', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more tokens with _preferClaimedTokens = false
    const newHolder = addrs[2];
    const numTokens = 20;
    await jbTokenStore.connect(controller).mintFor(newHolder.address, PROJECT_ID, numTokens, false);

    // Claim the unclaimed tokens
    const claimForTx = await jbTokenStore
      .connect(controller)
      .claimFor(newHolder.address, PROJECT_ID, numTokens);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens);

    await expect(claimForTx)
      .to.emit(jbTokenStore, 'Claim')
      .withArgs(newHolder.address, PROJECT_ID, numTokens, controller.address);
  });

  it(`Can't claim tokens if projectId isn't found`, async function () {
    const { addrs, jbTokenStore } = await setup();
    const newHolder = addrs[2];
    const numTokens = 20;

    await expect(
      jbTokenStore.claimFor(newHolder.address, PROJECT_ID, numTokens),
    ).to.be.revertedWith('0x24: NOT_FOUND');
  });

  it(`Can't claim more tokens than the current _unclaimedBalance`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more tokens with _preferClaimedTokens = false
    const newHolder = addrs[2];
    const numTokens = 20;
    await jbTokenStore.connect(controller).mintFor(newHolder.address, PROJECT_ID, numTokens, false);

    await expect(
      jbTokenStore.claimFor(newHolder.address, PROJECT_ID, numTokens + 1),
    ).to.be.revertedWith('0x25: INSUFFICIENT_FUNDS');
  });
});