import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from "../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json";
import jbProjects from "../../artifacts/contracts/JBProjects.sol/JBProjects.json";
import jbTerminal from "../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json";

// TODO(odd-amphora): Consider adding separate permissions tests; though we may want to fold these
// into JBOperatable tests.
describe('JBDirectory::addTerminalsOf(...)', function () {
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

  it('Should add terminals and emit events', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    let terminals = [terminal1.address, terminal2.address];
    let tx = await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, terminals);

    await Promise.all(
      terminals.map(async (terminalAddr, _) => {
        await expect(tx)
          .to.emit(jbDirectory, 'AddTerminal')
          .withArgs(
            PROJECT_ID,
            terminalAddr,
            caller.address
          );
      }),
    );
  });

  it('Should reject terminals with address(0)', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    let terminals = [terminal1.address, ethers.constants.AddressZero, terminal2.address];

    await expect(
      jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, terminals)
    ).to.be.revertedWith('0x2d: ZERO_ADDRESS');
  });

  it('Should not add terminals more than once', async function () {
    const { caller, jbDirectory, terminal1, terminal2 } = await setup();

    await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);
    await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal2.address, terminal1.address]);
    await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal1.address, terminal1.address]);
    await jbDirectory.connect(caller).addTerminalsOf(PROJECT_ID, [terminal2.address, terminal2.address]);

    let resultTerminals = [...(await jbDirectory.connect(caller).terminalsOf(PROJECT_ID))];
    resultTerminals.sort();

    let expectedTerminals = [terminal1.address, terminal2.address];
    expectedTerminals.sort();

    expect(resultTerminals).to.eql(expectedTerminals)
  });

});
