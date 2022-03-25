import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPayoutRedemptionPaymentTerminal.sol/IJBPayoutRedemptionPaymentTerminal.json';
import { impersonateAccount } from '../helpers/utils';

describe('JBDirectory::setTerminalsOf(...)', function () {
  const PROJECT_ID = 1;
  const ADDRESS_TOKEN_3 = ethers.Wallet.createRandom().address;
  let SET_TERMINALS_PERMISSION_INDEX;
  let SET_CONTROLLER_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    SET_TERMINALS_PERMISSION_INDEX = await jbOperations.SET_TERMINALS();
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

    let terminal1 = await deployMockContract(projectOwner, jbTerminal.abi);
    let terminal2 = await deployMockContract(projectOwner, jbTerminal.abi);
    let terminal3 = await deployMockContract(projectOwner, jbTerminal.abi);

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);
    await terminal2.mock.token.returns(ethers.Wallet.createRandom().address);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        SET_TERMINALS_PERMISSION_INDEX,
      )
      .returns(true);

    return {
      projectOwner,
      deployer,
      addrs,
      jbDirectory,
      terminal1,
      terminal2,
      terminal3,
      mockJbProjects,
      mockJbOperatorStore,
    };
  }

  it('Should add terminals and emit events if caller is project owner', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2 } = await setup();

    const terminals = [terminal1.address, terminal2.address];

    await expect(jbDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals))
      .to.emit(jbDirectory, 'SetTerminals')
      .withArgs(PROJECT_ID, terminals, projectOwner.address);
  });

  it('Should add terminals and remove a previous primary terminal if it is not included in the new terminals', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2, terminal3 } = await setup();

    const terminals = [terminal1.address, terminal2.address];

    await terminal3.mock.token.returns(ADDRESS_TOKEN_3);
    expect(await jbDirectory.connect(projectOwner).setPrimaryTerminalOf(PROJECT_ID, terminal3.address))
      .to.emit(jbDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address, projectOwner.address);

    await expect(jbDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals))
      .to.emit(jbDirectory, 'SetTerminals')
    //.withArgs(PROJECT_ID, terminals, projectOwner.address);

    expect(await jbDirectory.primaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3)).to.equal(ethers.constants.AddressZero);
  });

  it('Should add terminals and keep a previous primary terminal if it is included in the new terminals', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2, terminal3 } = await setup();

    const terminals = [terminal1.address, terminal2.address, terminal3.address];

    await terminal3.mock.token.returns(ADDRESS_TOKEN_3);
    expect(await jbDirectory.connect(projectOwner).setPrimaryTerminalOf(PROJECT_ID, terminal3.address))
      .to.emit(jbDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address, projectOwner.address);

    await expect(jbDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals))
      .to.emit(jbDirectory, 'SetTerminals')
    //.withArgs(PROJECT_ID, terminals, projectOwner.address);

    expect(await jbDirectory.primaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3)).to.equal(terminal3.address);
  });

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
      jbDirectory.connect(controllerSigner).setTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.be.reverted;

    // After the controller has been set, the controller signer should be able to add terminals.
    await jbDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller.address);
    await expect(
      jbDirectory.connect(controllerSigner).setTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.not.be.reverted;
  });

  it('Should add if caller has permission but is not the project owner', async function () {
    const { addrs, projectOwner, jbDirectory, mockJbOperatorStore, terminal1 } = await setup();
    const caller = addrs[1];

    // Give the caller permission to add terminals.
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_TERMINALS_PERMISSION_INDEX)
      .returns(true);

    await expect(jbDirectory.connect(caller).setTerminalsOf(PROJECT_ID, [terminal1.address])).to.not
      .be.reverted;
  });

  it("Can't add with duplicates", async function () {
    const { projectOwner, jbDirectory, terminal1 } =
      await setup();

    await expect(jbDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, [terminal1.address, terminal1.address])).to.be
      .revertedWith(errors.DUPLICATE_TERMINALS);
  });

  it("Can't add if caller does not have permission", async function () {
    const { addrs, projectOwner, jbDirectory, mockJbProjects, mockJbOperatorStore, terminal1 } =
      await setup();
    const caller = addrs[1];

    // Ensure the caller does not have permissions to add terminals.
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_TERMINALS_PERMISSION_INDEX)
      .returns(false);

    await expect(jbDirectory.connect(caller).setTerminalsOf(PROJECT_ID, [terminal1.address])).to.be
      .reverted;
  });
});
