import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbToken721 from '../../artifacts/contracts/JBToken721.sol/JBToken721.json';
import jbToken721Store from '../../artifacts/contracts/JBToken721Store.sol/JBToken721Store.json';

describe('JBController::issueTokenFor(...)', function () {
  const PROJECT_ID = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  let ISSUE_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ISSUE_PERMISSION_INDEX = await jbOperations.ISSUE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken,
      mockJbTokenStore,
      mockJbToken721,
      mockJbToken721Store,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbFundingCycleStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi),
      deployMockContract(deployer, jbTokenStore.abi),
      deployMockContract(deployer, jbToken721.abi),
      deployMockContract(deployer, jbToken721Store.abi),
    ]);

    let jbControllerFactory = await ethers.getContractFactory('contracts/JBController/1.sol:JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
      mockJbToken721Store.address
    );

    await mockJbTokenStore.mock.issueFor
      .withArgs(PROJECT_ID, NAME, SYMBOL)
      .returns(mockJbToken.address);

    await mockJbToken721Store.mock.issueFor
      .withArgs(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://')
      .returns(mockJbToken721.address);

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbController,
      mockJbTokenStore,
      mockJbToken,
      mockJbOperatorStore,
      mockJbToken721,
    };
  }

  it(`Should deploy an ERC-721 token contract if caller is project owner`, async function () {
    const { projectOwner, jbController, mockJbToken721 } = await setup();
    let returnedAddress = await jbController
      .connect(projectOwner)
      .callStatic.issueToken721For(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://');
    expect(returnedAddress).to.equal(mockJbToken721.address);
  });

  it(`Should deploy an ERC-721 token contract if caller is authorized`, async function () {
    const { addrs, projectOwner, jbController, mockJbToken721, mockJbOperatorStore } = await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX)
      .returns(true);

    let returnedAddress = await jbController
      .connect(caller)
      .callStatic.issueToken721For(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://');
    expect(returnedAddress).to.equal(mockJbToken721.address);
  });

  it(`Can't deploy an ERC-721 token contract if caller is not authorized`, async function () {
    const { addrs, projectOwner, jbController, mockJbOperatorStore } = await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, ISSUE_PERMISSION_INDEX)
      .returns(false);

    await expect(
      jbController.connect(caller).callStatic.issueToken721For(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://'),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });
});
