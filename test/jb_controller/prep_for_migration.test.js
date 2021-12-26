import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount, packFundingCycleMetadata } from '../helpers/utils';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import IJbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';

describe('JBController::prepForMigrationOf(...)', function () {
  const PROJECT_ID = 1;
  const TOTAL_SUPPLY = 20000;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);
    let mockTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    let mockSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockController = await deployMockContract(deployer, IJbController.abi);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    await mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(mockController.address);

    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(TOTAL_SUPPLY);

    return {
      projectOwner,
      addrs,
      jbController,
      mockJbDirectory,
      mockTokenStore,
      mockController,
      timestamp
    };
  }

  it(`Should set the processed token tracker as the total supply if caller is not project's current controller`, async function () {
    const { jbController, mockController, mockTokenStore } = await setup();

    let controllerSigner = await impersonateAccount(jbController.address);

    await expect(jbController.connect(controllerSigner).prepForMigrationOf(PROJECT_ID, ethers.constants.AddressZero))
      .to.be.not.reverted;

    // reserved token balance should be at 0 if processed token = total supply
    expect(await jbController.reservedTokenBalanceOf(PROJECT_ID, 10000)).to.equal(0);
  });

  it(`Can't prep for migration if the caller is the current controller`, async function () {
    const { jbController, mockController, mockJbDirectory } = await setup();

    let controllerSigner = await impersonateAccount(mockController.address);

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(jbController.address);

    await expect(jbController.connect(controllerSigner).prepForMigrationOf(PROJECT_ID, ethers.constants.AddressZero))
      .to.be.revertedWith('0x34: NO_OP');
  });


});