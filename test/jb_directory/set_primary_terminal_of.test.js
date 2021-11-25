import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from "../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json";
import jbProjects from "../../artifacts/contracts/JBProjects.sol/JBProjects.json";
import jbTerminal from "../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json";

describe('JBDirectory::setPrimaryTerminalOf(...)', function () {
  const PROJECT_ID = 13;

  let ADD_TERMINALS_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ADD_TERMINALS_PERMISSION_INDEX = await jbOperations.ADD_TERMINALS();
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

    return { caller, deployer, addrs, jbDirectory, terminal1, terminal2 };
  }

  it('Can\t set terminal with address(0)', async function () {
    const { caller, jbDirectory } = await setup();

    await expect(
      jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, ethers.constants.AddressZero)
    ).to.be.revertedWith('0x2e: ZERO_ADDRESS');
  });

  it('Setting primary terminal should emit event', async function () {
    const { caller, jbDirectory, terminal1 } = await setup();

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);

    let tx = await jbDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, terminal1.address);
    await expect(tx)
      .to.emit(jbDirectory, 'SetPrimaryTerminal')
      .withArgs(
        PROJECT_ID,
        terminal1TokenAddress,
        terminal1.address,
        caller.address
      )

  });

});
