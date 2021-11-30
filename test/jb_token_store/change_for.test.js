import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import { deployJbToken } from '../helpers/utils';

describe('JBTokenStore::changeFor(...)', function () {
  const PROJECT_ID = 2;

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbTokenStoreFactory = await ethers.getContractFactory('JBTokenStore');
    let jbTokenStore = await jbTokenStoreFactory.deploy(
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

  it('Should change tokens and emit event if caller is controller', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let controller = addrs[1];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // Issue the initial token and grab a reference to it.
    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, 'TestTokenDAO', 'TEST');
    let initialTokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    let initialToken = new Contract(initialTokenAddr, jbToken.abi);

    // Change to a new token.
    let newOwner = addrs[2];
    let newTokenName = 'NewTokenDAO';
    let newTokenSymbol = 'NEW';
    let newToken = await deployJbToken(newTokenName, newTokenSymbol);
    let changeTx = await jbTokenStore
      .connect(controller)
      .changeFor(PROJECT_ID, newToken.address, newOwner.address);

    let newTokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    newToken = new Contract(newTokenAddr, jbToken.abi);

    expect(await newToken.connect(controller).name()).to.equal(newTokenName);
    expect(await newToken.connect(controller).symbol()).to.equal(newTokenSymbol);

    // The ownership of the initial token should be changed.
    expect(await initialToken.connect(controller).owner()).to.equal(newOwner.address);

    await expect(changeTx)
      .to.emit(jbTokenStore, 'Change')
      .withArgs(PROJECT_ID, newTokenAddr, newOwner.address, controller.address);
  });

  it(`Can't change tokens if caller does not have permission`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let caller = addrs[1];

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      jbTokenStore
        .connect(caller)
        .changeFor(
          PROJECT_ID,
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
        ),
    ).to.be.revertedWith('0x4f: UNAUTHORIZED');
  });
});
