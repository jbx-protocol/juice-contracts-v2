import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPayoutRedemptionPaymentTerminal.sol/IJBPayoutRedemptionPaymentTerminal.json';

describe('JBDirectory::terminalsOf(...)', function () {
  const PROJECT_ID = 13;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);

    let jbDirectoryFactory = await ethers.getContractFactory('JBDirectory');
    let jbDirectory = await jbDirectoryFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      deployer.address
    );

    let terminal1 = await deployMockContract(projectOwner, jbTerminal.abi);
    let terminal2 = await deployMockContract(projectOwner, jbTerminal.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Add a few terminals
    await jbDirectory
      .connect(projectOwner)
      .setTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    return { projectOwner, deployer, addrs, jbDirectory, terminal1, terminal2 };
  }

  it('Should return terminals belonging to the project', async function () {
    const { projectOwner, jbDirectory, terminal1, terminal2 } = await setup();

    let terminals = [...(await jbDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    terminals.sort();

    let expectedTerminals = [terminal1.address, terminal2.address];
    expectedTerminals.sort();

    expect(terminals).to.eql(expectedTerminals);
  });
});
