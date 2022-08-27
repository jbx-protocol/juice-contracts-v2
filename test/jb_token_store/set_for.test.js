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

describe('JBTokenStore::setFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  let SET_TOKEN_INDEX;

  async function setup() {
    const [deployer, projectOwner, caller] = await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbToken = await deployMockContract(deployer, jbToken.abi);

    const jbTokenStoreFactory = await ethers.getContractFactory('JBTokenStore');
    const jbTokenStore = await jbTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    const jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    const jbOperations = await jbOperationsFactory.deploy();
    SET_TOKEN_INDEX = await jbOperations.SET_TOKEN();

    return {
      caller,
      projectOwner,
      mockJbDirectory,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbToken,
      jbTokenStore,
    };
  }

  it('Should set a token and emit event if caller is projectOwner', async function () {
    const { projectOwner, mockJbProjects, jbTokenStore } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Set to a new token.
    let newToken = await deployJbToken(TOKEN_NAME, TOKEN_SYMBOL, PROJECT_ID);
    const changeTx = await jbTokenStore.connect(projectOwner).setFor(PROJECT_ID, newToken.address);

    const newTokenAddr = await jbTokenStore.connect(projectOwner).tokenOf(PROJECT_ID);
    newToken = new Contract(newTokenAddr, jbToken.abi);

    expect(await newToken.connect(projectOwner).name()).to.equal(TOKEN_NAME);
    expect(await newToken.connect(projectOwner).symbol()).to.equal(TOKEN_SYMBOL);

    await expect(changeTx)
      .to.emit(jbTokenStore, 'Set')
      .withArgs(PROJECT_ID, newTokenAddr, projectOwner.address);
  });

  it(`Can't set a tokens if caller does not have permission`, async function () {
    const { projectOwner, caller, mockJbProjects, mockJbOperatorStore, jbTokenStore } =
      await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_TOKEN_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, SET_TOKEN_INDEX)
      .returns(false);

    await expect(
      jbTokenStore.connect(caller).setFor(PROJECT_ID, ethers.Wallet.createRandom().address),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it(`Can't set the address(0) as token`, async function () {
    const { projectOwner, mockJbProjects, jbTokenStore } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await expect(
      jbTokenStore.connect(projectOwner).setFor(PROJECT_ID, ethers.constants.AddressZero),
    ).to.be.revertedWith('EMPTY_TOKEN()');
  });

  it(`Can't set a token not returning the correct projectId`, async function () {
    const { projectOwner, mockJbProjects, jbTokenStore } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Set to a new token.
    let newToken = await deployJbToken(TOKEN_NAME, TOKEN_SYMBOL, PROJECT_ID + 1);

    await expect(
      jbTokenStore.connect(projectOwner).setFor(PROJECT_ID, newToken.address),
    ).to.be.revertedWith('PROJECT_ID_MISMATCH()');
  });

  it(`Can't set a token if another token has already been set`, async function () {
    const { projectOwner, mockJbProjects, jbTokenStore } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Set to a new token.
    let token = await deployJbToken(TOKEN_NAME, TOKEN_SYMBOL, PROJECT_ID);
    await jbTokenStore.connect(projectOwner).setFor(PROJECT_ID, token.address);

    let newToken = await deployJbToken(TOKEN_NAME, TOKEN_SYMBOL, PROJECT_ID);

    await expect(
      jbTokenStore.connect(projectOwner).setFor(PROJECT_ID, newToken.address),
    ).to.be.revertedWith('ALREADY_SET()');
  });

  it(`Can't add non-18 decimal token`, async function () {
    const { projectOwner, mockJbProjects, mockJbToken, jbTokenStore } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbToken.mock.decimals.returns(19);
    await mockJbToken.mock.projectId.returns(PROJECT_ID);

    await expect(
      jbTokenStore.connect(projectOwner).setFor(PROJECT_ID, mockJbToken.address),
    ).to.be.revertedWith(errors.TOKENS_MUST_HAVE_18_DECIMALS);
  });
});
