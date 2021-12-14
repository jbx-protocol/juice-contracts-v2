import { expect } from 'chai';
import { ethers, waffle, network } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';
import { impersonateAccount } from '../helpers/utils';

describe('JBDirectory::addTerminalsOf(...)', function () {
  const PROJECT_ID = 1;
  let ADD_TERMINALS_PERMISSION_INDEX;
  let SET_CONTROLLER_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ADD_TERMINALS_PERMISSION_INDEX = await jbOperations.ADD_TERMINALS();
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

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        ADD_TERMINALS_PERMISSION_INDEX,
      )
      .returns(true);

    return {
      projectOwner,
      deployer,
      addrs,
      jbDirectory,
      terminal1,
      terminal2,
      mockJbProjects,
      mockJbOperatorStore,
    };
  }

  it('Should add terminals and emit events if caller is project owner', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2 } = await setup();

    let terminals = [terminal1.address, terminal2.address];
    let tx = await jbDirectory.connect(projectOwner).addTerminalsOf(PROJECT_ID, terminals);

    await Promise.all(
      terminals.map(async (terminalAddr, _) => {
        await expect(tx)
          .to.emit(jbDirectory, 'AddTerminal')
          .withArgs(PROJECT_ID, terminalAddr, projectOwner.address);
      }),
    );
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

  it('Can\'t add if caller does not have permission', async function () {
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

  it('Can\'t add terminals with address(0)', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2 } = await setup();

    let terminals = [terminal1.address, ethers.constants.AddressZero, terminal2.address];

    await expect(
      jbDirectory.connect(projectOwner).addTerminalsOf(PROJECT_ID, terminals),
    ).to.be.revertedWith('0x2d: ZERO_ADDRESS');
  });

  it('Can\'t add terminals more than once', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2 } = await setup();

    await jbDirectory
      .connect(projectOwner)
      .addTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);
    await jbDirectory
      .connect(projectOwner)
      .addTerminalsOf(PROJECT_ID, [terminal2.address, terminal1.address]);
    await jbDirectory
      .connect(projectOwner)
      .addTerminalsOf(PROJECT_ID, [terminal1.address, terminal1.address]);
    await jbDirectory
      .connect(projectOwner)
      .addTerminalsOf(PROJECT_ID, [terminal2.address, terminal2.address]);

    let resultTerminals = [...(await jbDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    resultTerminals.sort();

    let expectedTerminals = [terminal1.address, terminal2.address];
    expectedTerminals.sort();

    expect(resultTerminals).to.eql(expectedTerminals);
  });
});
