import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';

describe('JBTokenStore::burnFrom(...)', function () {
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

  /* Happy path tests with controller access */

  it('Should burn only claimed tokens and emit event', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more claimed tokens
    const newHolder = addrs[2];
    const numTokens = BigInt(2 ** 224) - BigInt(1); // ERC20Votes max supply of (2^224)-1
    const preferClaimedTokens = true;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    // Burn the claimed tokens
    const burnFromTx = await jbTokenStore
      .connect(controller)
      .burnFrom(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(0);

    await expect(burnFromTx)
      .to.emit(jbTokenStore, 'Burn')
      .withArgs(
        newHolder.address,
        PROJECT_ID,
        numTokens,
        0,
        preferClaimedTokens,
        controller.address,
      );
  });

  it('Should burn claimed tokens, then unclaimed tokens and emit event', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more claimed tokens
    const newHolder = addrs[2];
    const numTokens = BigInt(2 ** 224) - BigInt(1); // ERC20Votes max supply of (2^224)-1
    const preferClaimedTokens = true;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    // Mint more unclaimed tokens
    await jbTokenStore.connect(controller).mintFor(newHolder.address, PROJECT_ID, numTokens, false);

    // Burn all claimed tokens and then some of the unclaimed tokens. Leave 1 unclaimed token.
    const burnAmt = numTokens * BigInt(2) - BigInt(1);
    const burnFromTx = await jbTokenStore
      .connect(controller)
      .burnFrom(newHolder.address, PROJECT_ID, burnAmt, preferClaimedTokens);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(1);
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(1);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(1);

    await expect(burnFromTx)
      .to.emit(jbTokenStore, 'Burn')
      .withArgs(
        newHolder.address,
        PROJECT_ID,
        burnAmt,
        numTokens,
        preferClaimedTokens,
        controller.address,
      );
  });

  it('Should burn unclaimed tokens, then claimed tokens and emit event', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more claimed tokens
    const newHolder = addrs[2];
    const numTokens = BigInt(2 ** 224) - BigInt(1); // ERC20Votes max supply of (2^224)-1
    const preferClaimedTokens = true;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    // Mint more unclaimed tokens
    await jbTokenStore.connect(controller).mintFor(newHolder.address, PROJECT_ID, numTokens, false);

    // Burn all unclaimed tokens and then some of the claimed tokens. Leave 1 claimed token.
    const burnAmt = numTokens * BigInt(2) - BigInt(1);
    const burnFromTx = await jbTokenStore
      .connect(controller)
      .burnFrom(newHolder.address, PROJECT_ID, burnAmt, false);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(1);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(1);

    await expect(burnFromTx)
      .to.emit(jbTokenStore, 'Burn')
      .withArgs(newHolder.address, PROJECT_ID, burnAmt, numTokens, false, controller.address);
  });

  it('Should burn only unclaimed tokens and emit event', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more unclaimed tokens
    const newHolder = addrs[2];
    const numTokens = BigInt(2 ** 224) - BigInt(1); // ERC20Votes max supply of (2^224)-1
    const preferClaimedTokens = false;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    // Burn the unclaimed tokens
    const burnFromTx = await jbTokenStore
      .connect(controller)
      .burnFrom(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    expect(await jbTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(0);

    await expect(burnFromTx)
      .to.emit(jbTokenStore, 'Burn')
      .withArgs(
        newHolder.address,
        PROJECT_ID,
        numTokens,
        numTokens,
        preferClaimedTokens,
        controller.address,
      );
  });

  /* Sad path testing */

  it(`Can't burn tokens if caller doesn't have permission`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const caller = addrs[1];

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      jbTokenStore.connect(caller).burnFrom(caller.address, PROJECT_ID, 1, true),
    ).to.be.revertedWith('0x4f: UNAUTHORIZED');
  });

  it(`Can't burn more tokens than the available balance`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    // Mint more claimed tokens
    const newHolder = addrs[2];
    const numTokens = BigInt(2 ** 224) - BigInt(1); // ERC20Votes max supply of (2^224)-1
    const preferClaimedTokens = true;
    await jbTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens);

    // Mint more unclaimed tokens
    await jbTokenStore.connect(controller).mintFor(newHolder.address, PROJECT_ID, numTokens, false);

    // Burn more than the available balance
    const burnAmt = numTokens * BigInt(2) + BigInt(1);

    await expect(
      jbTokenStore
        .connect(controller)
        .burnFrom(newHolder.address, PROJECT_ID, burnAmt, preferClaimedTokens),
    ).to.be.revertedWith('0x23: INSUFFICIENT_FUNDS');
  });

  it(`Can't burn any tokens if none have been issued or allocated'`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const newHolder = addrs[2];
    const numTokens = 1;
    const preferClaimedTokens = true;

    await expect(
      jbTokenStore
        .connect(controller)
        .burnFrom(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens),
    ).to.be.revertedWith('0x23: INSUFFICIENT_FUNDS');
  });

  it(`Can't burn any tokens if burn amount <= 0'`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    const controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const newHolder = addrs[2];
    const numTokens = 0;
    const preferClaimedTokens = true;

    await expect(
      jbTokenStore
        .connect(controller)
        .burnFrom(newHolder.address, PROJECT_ID, numTokens, preferClaimedTokens),
    ).to.be.revertedWith('0x22: NO_OP');
  });
});
