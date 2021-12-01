import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

describe('JBDirectory::isTerminalDelegateOf(...)', function () {
  const PROJECT_ID = 13;

  let ADD_TERMINALS_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ADD_TERMINALS_PERMISSION_INDEX = await jbOperations.ADD_TERMINALS();
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

    let terminal1Delegate = ethers.Wallet.createRandom().address;
    await terminal1.mock.delegate.returns(terminal1Delegate);

    let terminal2Delegate = ethers.Wallet.createRandom().address;
    await terminal2.mock.delegate.returns(terminal2Delegate);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        ADD_TERMINALS_PERMISSION_INDEX,
      )
      .returns(true);

    // Add a few terminals
    await jbDirectory
      .connect(projectOwner)
      .addTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    return {
      projectOwner,
      deployer,
      addrs,
      jbDirectory,
      terminal1,
      terminal2,
      terminal1Delegate,
      terminal2Delegate,
    };
  }

  it('Should return false if no delegate is set', async function () {
    const { projectOwner, jbDirectory } = await setup();

    expect(
      await jbDirectory
        .connect(projectOwner)
        .isTerminalDelegateOf(PROJECT_ID, ethers.Wallet.createRandom().address),
    ).to.be.false;
  });

  it('Should return true if delegate is set', async function () {
    const { projectOwner, jbDirectory, terminal1Delegate, terminal2Delegate } = await setup();

    expect(
      await jbDirectory.connect(projectOwner).isTerminalDelegateOf(PROJECT_ID, terminal1Delegate),
    ).to.be.true;

    expect(
      await jbDirectory.connect(projectOwner).isTerminalDelegateOf(PROJECT_ID, terminal2Delegate),
    ).to.be.true;
  });
});
