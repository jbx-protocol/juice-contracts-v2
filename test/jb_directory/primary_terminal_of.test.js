import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

describe('JBDirectory::primaryTerminalOf(...)', function () {
  const PROJECT_ID = 13;

  let ADD_TERMINALS_PERMISSION_INDEX;
  let SET_PRIMARY_TERMINAL_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ADD_TERMINALS_PERMISSION_INDEX = await jbOperations.ADD_TERMINALS();
    SET_PRIMARY_TERMINAL_PERMISSION_INDEX = await jbOperations.SET_PRIMARY_TERMINAL();
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
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, caller.address, PROJECT_ID, SET_PRIMARY_TERMINAL_PERMISSION_INDEX)
      .returns(true);

    // Add a few terminals
    await jbDirectory
      .connect(caller)
      .addTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    return { caller, deployer, addrs, jbDirectory, terminal1, terminal2 };
  }

  it('Returns primary terminal if set', async function () {
    const { caller, jbDirectory, terminal1 } = await setup();

    let token = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(token);

    await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);

    expect(await jbDirectory.connect(caller).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal1.address,
    );
  });

  it('Returns terminal with matching token if set', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);

    let token = ethers.Wallet.createRandom().address;
    await terminal2.mock.token.returns(token);

    expect(await jbDirectory.connect(caller).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal2.address,
    );
  });
});
