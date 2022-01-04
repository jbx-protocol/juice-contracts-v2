import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import { deployJbToken } from '../helpers/utils';
import errors from '../helpers/errors.json';

describe('JBTokenStore::changeFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';
  const NEW_TOKEN_NAME = 'NewTokenDAO';
  const NEW_TOKEN_SYMBOL = 'NEW';

  async function setup() {
    const [deployer, controller, newOwner] = await ethers.getSigners();

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
      newOwner,
      controller,
      mockJbDirectory,
      jbTokenStore,
    };
  }

  it('Should change tokens and emit event if caller is controller', async function () {
    const { newOwner, controller, mockJbDirectory, jbTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // Issue the initial token and grab a reference to it.
    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);
    const initialTokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    const initialToken = new Contract(initialTokenAddr, jbToken.abi);

    // Change to a new token.
    let newToken = await deployJbToken(NEW_TOKEN_NAME, NEW_TOKEN_SYMBOL);
    const changeTx = await jbTokenStore
      .connect(controller)
      .changeFor(PROJECT_ID, newToken.address, newOwner.address);

    const newTokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    newToken = new Contract(newTokenAddr, jbToken.abi);

    expect(await newToken.connect(controller).name()).to.equal(NEW_TOKEN_NAME);
    expect(await newToken.connect(controller).symbol()).to.equal(NEW_TOKEN_SYMBOL);

    // The ownership of the initial token should be changed.
    expect(await initialToken.connect(controller).owner()).to.equal(newOwner.address);

    await expect(changeTx)
      .to.emit(jbTokenStore, 'Change')
      .withArgs(PROJECT_ID, newTokenAddr, newOwner.address, controller.address);
  });

  it('Should change tokens without changing owner of old token', async function () {
    const { controller, mockJbDirectory, jbTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // Issue the initial token and grab a reference to it.
    await jbTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);
    const initialTokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    const initialToken = new Contract(initialTokenAddr, jbToken.abi);
    const initialTokenOwner = await initialToken.connect(controller).owner();

    // Change to a new token without assigning a new owner for the old token
    let newToken = await deployJbToken(NEW_TOKEN_NAME, NEW_TOKEN_SYMBOL);
    const changeTx = await jbTokenStore
      .connect(controller)
      .changeFor(PROJECT_ID, newToken.address, ethers.constants.AddressZero);

    const newTokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    newToken = new Contract(newTokenAddr, jbToken.abi);

    expect(await newToken.connect(controller).name()).to.equal(NEW_TOKEN_NAME);
    expect(await newToken.connect(controller).symbol()).to.equal(NEW_TOKEN_SYMBOL);

    // The ownership of the initial token should not be changed.
    expect(await initialToken.connect(controller).owner()).to.equal(initialTokenOwner);

    await expect(changeTx)
      .to.emit(jbTokenStore, 'Change')
      .withArgs(PROJECT_ID, newTokenAddr, ethers.constants.AddressZero, controller.address);
  });

  it(`Can't change tokens if caller does not have permission`, async function () {
    const { controller, mockJbDirectory, jbTokenStore } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      jbTokenStore
        .connect(controller)
        .changeFor(
          PROJECT_ID,
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
        ),
    ).to.be.revertedWith(errors.CONTROLLER_UNAUTHORIZED);
  });
});
