import { expect } from 'chai';
import { ethers, waffle, network } from 'hardhat';



import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

//import { impersonateAccount } from '../helpers/utils';

describe.only('JBController::issueTokenFor(...)', function () {
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
    let mockTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    let mockSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        ISSUE_PERMISSION_INDEX,
      )
      .returns(true);

    return {
      projectOwner,
      deployer,
      addrs,
      jbController
    };
  }


  it('Should deploy an ERC-20 token contract if caller is project owner', async function () {
    const { projectOwner, deployer, jbController } = await setup();

    let mockToken = await deployMockContract(deployer, jbToken.abi);
    let mockTokenStore = await deployMockContract(deployer, jbTokenStore.abi);

    await mockTokenStore.mock.issueFor
      .withArgs(PROJECT_ID, NAME, SYMBOL)
      .returns(mockToken.address);

    let tx = await jbController.connect(projectOwner).issueTokenFor(PROJECT_ID, NAME, SYMBOL);
    console.log(tx);
    //expect(tx).to.equal(mockToken.address);

  });

  /*
  it('Should add if caller is controller of the project', async function () {
    const { addrs, projectOwner, jbDirectory, mockJbProjects, mockJbOperatorStore, terminal1 } =
      await setup();
    // Give the project owner permissions to set the controller.
    await mockJbProjects.mock.count.returns(1);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        SET_CONTROLLER_PERMISSION_INDEX,
      )
      .returns(true);

    let controller = await deployMockContract(addrs[1], jbController.abi);
    let controllerSigner = await impersonateAccount(controller.address);

    await expect(
      jbDirectory.connect(controllerSigner).addTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.be.reverted;

    // After the controller has been set, the controller signer should be able to add terminals.
    await jbDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller.address);
    await expect(
      jbDirectory.connect(controllerSigner).addTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.not.be.reverted;
  });

  it('Should add if caller has permission but is not the project owner', async function () {
    const { addrs, projectOwner, jbDirectory, mockJbOperatorStore, terminal1 } = await setup();
    const caller = addrs[1];

    // Give the caller permission to add terminals.
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ADD_TERMINALS_PERMISSION_INDEX)
      .returns(true);

    await expect(jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal1.address])).to.not
      .be.reverted;
  });

  it('Should reject if caller does not have permission', async function () {
    const { addrs, projectOwner, jbDirectory, mockJbProjects, mockJbOperatorStore, terminal1 } =
      await setup();
    const caller = addrs[1];

    // Ensure the caller does not have permissions to add terminals.
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ADD_TERMINALS_PERMISSION_INDEX)
      .returns(false);

    await expect(jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal1.address])).to.be
      .reverted;
  });

  */
});
