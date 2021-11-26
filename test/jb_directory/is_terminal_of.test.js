import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

describe('JBDirectory::isTerminalOf(...)', function () {
  const PROJECT_ID = 13;

  let ADD_TERMINALS_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ADD_TERMINALS_PERMISSION_INDEX = await jbOperations.ADD_TERMINALS();
  });

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();
    let caller = addrs[1];

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);

    let jbDirectoryFactory = await ethers.getContractFactory('JBDirectory');
    let jbDirectory = await jbDirectoryFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
    );

    let terminal1 = await deployMockContract(caller, jbTerminal.abi);
    let terminal2 = await deployMockContract(caller, jbTerminal.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(caller.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, caller.address, PROJECT_ID, ADD_TERMINALS_PERMISSION_INDEX)
      .returns(true);

    // Add a few terminals
    await jbDirectory
      .connect(caller)
      .addTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    return { caller, deployer, addrs, jbDirectory, terminal1, terminal2 };
  }

  it('Returns true if the terminal belongs to the project', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    expect(await jbDirectory.connect(caller).isTerminalOf(PROJECT_ID, terminal1.address)).to.be
      .true;

    expect(await jbDirectory.connect(caller).isTerminalOf(PROJECT_ID, terminal2.address)).to.be
      .true;
  });

  it(`Returns false if the terminal doesn't belong to the project`, async function () {
    const { caller, jbDirectory } = await setup();

    expect(
      await jbDirectory
        .connect(caller)
        .isTerminalOf(PROJECT_ID, ethers.Wallet.createRandom().address),
    ).to.be.false;
  });

  it(`Returns false if the project does not exist`, async function () {
    const { caller, jbDirectory } = await setup();

    expect(
      await jbDirectory.connect(caller).isTerminalOf(123, ethers.Wallet.createRandom().address),
    ).to.be.false;
  });
});
