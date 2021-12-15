import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import iJbFundingCycleDataSource from '../../artifacts/contracts/interfaces/IJBFundingCycleDataSource.sol/IJBFundingCycleDataSource.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JBController::changeTokenOf(...)', function () {
  const PROJECT_ID = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';

  let CHANGE_TOKEN_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    CHANGE_TOKEN_INDEX = await jbOperations.CHANGE_TOKEN();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);
    let mockJbFundingCycleDataSource = await deployMockContract(deployer, iJbFundingCycleDataSource);
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

  it(`Should change current token if caller is project owner and funding cycle not paused`, async function () {
    const { projectOwner, addrs, jbController, mockToken, mockJbFundingCycleStore } = await setup();
    let newTokenOwner = addrs[O];



    await mockJbFundingCycleStore.mock.currentOf
      .withArgs(PROJECT_ID)
      .returns(mockFundingCycle.address);

    await mockJbFundingCycleStore.mock.changeTokenAllowed
      .returns(true);

    await mockTokenStore.mock.changeFor
      .withArgs(PROJECT_ID, mockToken.address, newTokenOwner.address)
      .returns();

    expect(jbController.connect(projectOwner).changeTokenOf(PROJECT_ID, mockToken.address, newTokenOwner.address)).to.be.not.reverted();
  });

});
