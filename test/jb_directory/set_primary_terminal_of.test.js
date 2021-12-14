import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';
import errors from "../helpers/errors.json"

describe('JBDirectory::setPrimaryTerminalOf(...)', function () {
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

    return {
      projectOwner,
      deployer,
      addrs,
      jbDirectory,
      mockJbOperatorStore,
      terminal1,
      terminal2,
    };
  }

  it(`Can't set primary terminal with address(0)`, async function () {
    const { projectOwner, jbDirectory } = await setup();

    await expect(
      jbDirectory
        .connect(projectOwner)
        .setPrimaryTerminalOf(PROJECT_ID, ethers.constants.AddressZero),
    ).to.be.revertedWith(errors.ZERO_ADDRESS);
  });

  it('Should setting primary terminal and emit an event', async function () {
    const { projectOwner, jbDirectory, terminal1 } = await setup();

    // Initially no terminals should be set.
    let initialTerminals = [...(await jbDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    expect(initialTerminals.length).to.equal(0);

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);

    let tx = await jbDirectory
      .connect(projectOwner)
      .setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    await expect(tx)
      .to.emit(jbDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, terminal1TokenAddress, terminal1.address, projectOwner.address);

    let resultTerminals = [...(await jbDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    resultTerminals.sort();

    // After the primary terminal is set it should be added to the project.
    let expectedTerminals = [terminal1.address];
    expectedTerminals.sort();

    expect(resultTerminals).to.eql(expectedTerminals);
  });

  it("Can't set primary terminal if caller is not project owner but has permissions", async function () {
    const { projectOwner, addrs, jbDirectory, mockJbOperatorStore, terminal1 } = await setup();
    let caller = addrs[1];

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        caller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address)).to
      .not.be.reverted;
  });

  it(`Can't set primary terminal if caller is not project owner and does not have permission`, async function () {
    const { projectOwner, addrs, jbDirectory, mockJbOperatorStore, terminal1 } = await setup();
    let caller = addrs[1];

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        caller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(false);

    await expect(jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address)).to
      .be.reverted;
  });

  it(`Can't set the same primary terminal twice in a row`, async function () {
    const { projectOwner, jbDirectory, terminal1 } = await setup();

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);

    // Should succeed on the first attempt and then fail on the second.
    await jbDirectory.connect(projectOwner).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    await expect(
      jbDirectory.connect(projectOwner).setPrimaryTerminalOf(PROJECT_ID, terminal1.address),
    ).to.be.revertedWith(errors.ALREADY_SET);
  });

  it('Should set multiple terminals for the same project with the same token', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2 } = await setup();

    let token = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(token);
    await terminal2.mock.token.returns(token);

    let terminals = [terminal1.address, terminal2.address];
    await jbDirectory.connect(projectOwner).addTerminalsOf(PROJECT_ID, terminals);

    await jbDirectory.connect(projectOwner).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    expect(await jbDirectory.connect(projectOwner).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal1.address,
    );

    await jbDirectory.connect(projectOwner).setPrimaryTerminalOf(PROJECT_ID, terminal2.address);
    expect(await jbDirectory.connect(projectOwner).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal2.address,
    );
  });
});
