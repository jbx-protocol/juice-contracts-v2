import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from "../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json";
import jbController from "../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json";
import jbProjects from "../../artifacts/contracts/JBProjects.sol/JBProjects.json";
import jbTerminal from "../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json";

// TODO(odd-amphora): Permissions.
describe('JBDirectory::setControllerOf(...)', function () {
  const PROJECT_ID = 1;

  let SET_CONTROLLER_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    SET_CONTROLLER_PERMISSION_INDEX = await jbOperations.SET_CONTROLLER();
  })

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();
    let caller = addrs[1];

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);

    let jbDirectoryFactory = await ethers.getContractFactory('JBDirectory');
    let jbDirectory = await jbDirectoryFactory.deploy(mockJbOperatorStore.address, mockJbProjects.address);

    let controller1 = await deployMockContract(caller, jbController.abi);
    let controller2 = await deployMockContract(caller, jbController.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(caller.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, caller.address, PROJECT_ID, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(true);

    return { caller, deployer, addrs, jbDirectory, mockJbProjects, controller1, controller2 };
  }

  it(`Can't set zero address`, async function () {
    const { caller, jbDirectory } = await setup();

    await expect(
      jbDirectory.connect(caller).setControllerOf(PROJECT_ID, ethers.constants.AddressZero)
    ).to.be.revertedWith('0x2b: ZERO_ADDRESS');
  });

  it(`Can't set if project id does not exist`, async function () {
    const { caller, jbDirectory, mockJbProjects, controller1 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID - 1);

    await expect(
      jbDirectory.connect(caller).setControllerOf(PROJECT_ID, controller1.address)
    ).to.be.revertedWith('0x2c: NOT_FOUND');
  });

  it('Should set controller and emit event', async function () {
    const { caller, jbDirectory, mockJbProjects, controller1 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    let tx = await jbDirectory.connect(caller).setControllerOf(PROJECT_ID, controller1.address);

    await expect(tx)
      .to.emit(jbDirectory, 'SetController')
      .withArgs(
        PROJECT_ID,
        controller1.address,
        caller.address
      );

    // The controller should be set.
    let controller = await jbDirectory.connect(caller).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller1.address);
  });

});
