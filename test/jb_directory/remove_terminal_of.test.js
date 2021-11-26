import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from "../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json";
import jbProjects from "../../artifacts/contracts/JBProjects.sol/JBProjects.json";
import jbTerminal from "../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json";

// TODO(odd-amphora): Permissions.
describe('JBDirectory::removeTerminal(...)', function () {
  const PROJECT_ID = 13;

  let ADD_TERMINALS_PERMISSION_INDEX;
  let REMOVE_TERMINAL_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ADD_TERMINALS_PERMISSION_INDEX = await jbOperations.ADD_TERMINALS();
    REMOVE_TERMINAL_PERMISSION_INDEX = await jbOperations.REMOVE_TERMINAL();
  })

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();
    let caller = addrs[1];

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);

    let jbDirectoryFactory = await ethers.getContractFactory('JBDirectory');
    let jbDirectory = await jbDirectoryFactory.deploy(mockJbOperatorStore.address, mockJbProjects.address);

    let terminal1 = await deployMockContract(caller, jbTerminal.abi);
    let terminal2 = await deployMockContract(caller, jbTerminal.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(caller.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, caller.address, PROJECT_ID, ADD_TERMINALS_PERMISSION_INDEX)
      .returns(true);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, caller.address, PROJECT_ID, REMOVE_TERMINAL_PERMISSION_INDEX)
      .returns(true);

    // Add a few terminals.
    await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    return { caller, deployer, addrs, jbDirectory, terminal1, terminal2 };
  }

  it('Should remove terminal and emit event', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);

    let tx = await jbDirectory.connect(caller).removeTerminalOf(PROJECT_ID, terminal1.address);

    await expect(tx)
      .to.emit(jbDirectory, 'RemoveTerminal')
      .withArgs(
        PROJECT_ID,
        terminal1.address,
        caller.address
      );

    let terminals = [...(await jbDirectory.connect(caller).terminalsOf(PROJECT_ID))];
    terminals.sort();

    // Only terminal 2 should remain.
    expect(terminals).to.eql([terminal2.address]);
  });

  it('Should remove primary terminal if it is set', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);
    await terminal2.mock.token.returns(ethers.Wallet.createRandom().address);

    // Set terminal1 as the primary and remove it.
    await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    await jbDirectory.connect(caller).removeTerminalOf(PROJECT_ID, terminal1.address);

    // The primary terminal should no longer be set.
    expect(
      await jbDirectory.connect(caller).primaryTerminalOf(PROJECT_ID, terminal1TokenAddress)
    ).to.equal(ethers.constants.AddressZero);
  })

});
