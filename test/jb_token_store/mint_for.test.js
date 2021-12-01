import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';

describe('JBTokenStore::mintFor(...)', function () {
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

  it('Should mint claimed tokens and emit event if caller is controller', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more tokens with _preferClaimedTokens = true
    const newHolder = addrs[2];
    const numTokens = 20;
    const mintForTx = await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, true);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens);

    await expect(mintForTx)
      .to.emit(jbTokenStore, 'Mint')
      .withArgs(newHolder.address, PROJECT_ID, numTokens, true, true, controller.address);
  });

  it('Should mint unclaimed tokens and emit event if caller is controller', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more tokens with _preferClaimedTokens = false
    const newHolder = addrs[2];
    const numTokens = 20;
    const mintForTx = await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, false);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(
      numTokens,
    );
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens);

    await expect(mintForTx)
      .to.emit(jbTokenStore, 'Mint')
      .withArgs(newHolder.address, PROJECT_ID, numTokens, false, false, controller.address);
  });

  it(`Can't mint tokens if _amount <= 0`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const newHolder = addrs[2];
    const numTokens = 0;

    await expect(
      jbTokenStore.connect(controller).mintFor(newHolder.address, PROJECT_ID, numTokens, true),
    ).to.be.revertedWith('0x22: NO_OP');
  });

  it(`Can't mint tokens if caller does not have permission`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(jbTokenStore.mintFor(addrs[1].address, PROJECT_ID, 1, true)).to.be.revertedWith(
      '0x4f: UNAUTHORIZED',
    );
  });
});
