import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';

// TODO(odd-amphora): Access control tests with allowlist.
describe('JBDirectory::setControllerOf(...)', function () {
  const PROJECT_ID = 1;

  let SET_CONTROLLER_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    SET_CONTROLLER_PERMISSION_INDEX = await jbOperations.SET_CONTROLLER();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);

    let jbDirectoryFactory = await ethers.getContractFactory('JBDirectory');
    let jbDirectory = await jbDirectoryFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
    );

    let controller1 = await deployMockContract(projectOwner, jbController.abi);
    let controller2 = await deployMockContract(projectOwner, jbController.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        SET_CONTROLLER_PERMISSION_INDEX,
      )
      .returns(true);

    return {
      projectOwner,
      deployer,
      addrs,
      jbDirectory,
      mockJbProjects,
      mockJbOperatorStore,
      controller1,
      controller2,
    };
  }

  it(`Can't set zero address`, async function () {
    const { projectOwner, jbDirectory } = await setup();

    await expect(
      jbDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, ethers.constants.AddressZero),
    ).to.be.revertedWith('0x2b: ZERO_ADDRESS');
  });

  it(`Can't set if project id does not exist`, async function () {
    const { projectOwner, jbDirectory, mockJbProjects, controller1 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID - 1);

    await expect(
      jbDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller1.address),
    ).to.be.revertedWith('0x2c: NOT_FOUND');
  });

  it('Should set controller and emit event if caller is project owner', async function () {
    const { projectOwner, jbDirectory, mockJbProjects, controller1 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    let tx = await jbDirectory
      .connect(projectOwner)
      .setControllerOf(PROJECT_ID, controller1.address);

    await expect(tx)
      .to.emit(jbDirectory, 'SetController')
      .withArgs(PROJECT_ID, controller1.address, projectOwner.address);

    // The controller should be set.
    let controller = await jbDirectory.connect(projectOwner).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller1.address);
  });

  it('Should set controller if caller is not project owner but has permission', async function () {
    const { projectOwner, addrs, jbDirectory, mockJbProjects, mockJbOperatorStore, controller1 } =
      await setup();
    let caller = addrs[1];

    await mockJbProjects.mock.count.returns(PROJECT_ID);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(true);

    await expect(jbDirectory.connect(caller).setControllerOf(PROJECT_ID, controller1.address)).to
      .not.be.reverted;
  });

  it('Should fail if caller does not have permission', async function () {
    const { projectOwner, addrs, jbDirectory, mockJbProjects, mockJbOperatorStore, controller1 } =
      await setup();
    let caller = addrs[1];

    await mockJbProjects.mock.count.returns(PROJECT_ID);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(false);

    await expect(jbDirectory.connect(caller).setControllerOf(PROJECT_ID, controller1.address)).to.be
      .reverted;
  });
});
