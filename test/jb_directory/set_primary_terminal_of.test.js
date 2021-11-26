import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

// TODO(odd-amphora): Permissions.
/**
 * Tests the following:
 *
 * JBDirectory::setPrimaryTerminalOf(...)
 * JBDirectory::primaryTerminalOf(...)
 */
describe('JBDirectory::setPrimaryTerminalOf(...)', function () {
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

    return { caller, deployer, addrs, jbDirectory, terminal1, terminal2 };
  }

  it(`Can't set primary terminal with address(0)`, async function () {
    const { caller, jbDirectory } = await setup();

    await expect(
      jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, ethers.constants.AddressZero),
    ).to.be.revertedWith('0x2e: ZERO_ADDRESS');
  });

  it('Setting primary terminal should emit an event and be added to terminals', async function () {
    const { caller, jbDirectory, terminal1 } = await setup();

    // Initially no terminals should be set.
    let initialTerminals = [...(await jbDirectory.connect(caller).terminalsOf(PROJECT_ID))];
    expect(initialTerminals.length).to.equal(0);

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);

    let tx = await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    await expect(tx)
      .to.emit(jbDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, terminal1TokenAddress, terminal1.address, caller.address);

    let resultTerminals = [...(await jbDirectory.connect(caller).terminalsOf(PROJECT_ID))];
    resultTerminals.sort();

    // After the primary terminal is set it should be added to the project.
    let expectedTerminals = [terminal1.address];
    expectedTerminals.sort();

    expect(resultTerminals).to.eql(expectedTerminals);
  });

  it(`Can't set the same primary terminal twice in a row`, async function () {
    const { caller, jbDirectory, terminal1 } = await setup();

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);

    // Should succeed on the first attempt and then fail on the second.
    await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    await expect(
      jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address),
    ).to.be.revertedWith('0x2f: ALREADY_SET');
  });

  it('Multiple terminals for the same project with the same token', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    let token = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(token);
    await terminal2.mock.token.returns(token);

    let terminals = [terminal1.address, terminal2.address];
    await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, terminals);

    await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    expect(await jbDirectory.connect(caller).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal1.address,
    );

    await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal2.address);
    expect(await jbDirectory.connect(caller).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal2.address,
    );
  });
});
