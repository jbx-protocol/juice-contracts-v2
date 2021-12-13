import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JBController::issueTokenFor(...)', function () {
  const PROJECT_ID = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';

  let ISSUE_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ISSUE_PERMISSION_INDEX = await jbOperations.ISSUE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);
    let mockSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockTokenStore = await deployMockContract(deployer, jbTokenStore.abi);

    let mockToken = await deployMockContract(deployer, jbToken.abi);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    await mockTokenStore.mock.issueFor
      .withArgs(PROJECT_ID, NAME, SYMBOL)
      .returns(mockToken.address);

    await mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(projectOwner.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX,)
      .returns(true);

    return {
      projectOwner,
      deployer,
      addrs,
      jbController,
      mockTokenStore,
      mockToken,
      mockJbOperatorStore
    };
  }

  it(`Should deploy an ERC-20 token contract if caller is project owner`, async function () {
    const { projectOwner, jbController, mockToken } = await setup();
    let returnedAddress = await jbController.connect(projectOwner).callStatic.issueTokenFor(PROJECT_ID, NAME, SYMBOL);
    expect(returnedAddress).to.equal(mockToken.address);
  });

  it(`Should deploy an ERC-20 token contract if caller is authorized`, async function () {
    const { addrs, projectOwner, jbController, mockToken, mockJbOperatorStore } = await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX,)
      .returns(true);

    let returnedAddress = await jbController.connect(caller).callStatic.issueTokenFor(PROJECT_ID, NAME, SYMBOL);
    expect(returnedAddress).to.equal(mockToken.address);
  });

  it(`Can't deploy an ERC-20 token contract if caller is not authorized`, async function () {
    const { addrs, projectOwner, jbController, mockToken, mockJbOperatorStore } = await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX,)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, ISSUE_PERMISSION_INDEX,)
      .returns(false);

    await expect(
      jbController.connect(caller).callStatic.issueTokenFor(PROJECT_ID, NAME, SYMBOL)
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });
});
