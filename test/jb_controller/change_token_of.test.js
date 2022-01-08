import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../helpers/utils';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JBController::changeTokenOf(...)', function () {
  const PROJECT_ID = 1;
  const DOMAIN = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';
  let CHANGE_TOKEN_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    CHANGE_TOKEN_INDEX = await jbOperations.CHANGE_TOKEN();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let promises = [];

    promises.push(deployMockContract(deployer, jbOperatoreStore.abi));
    promises.push(deployMockContract(deployer, jbProjects.abi));
    promises.push(deployMockContract(deployer, jbDirectory.abi));
    promises.push(deployMockContract(deployer, jbFundingCycleStore.abi));
    promises.push(deployMockContract(deployer, jbTokenStore.abi));
    promises.push(deployMockContract(deployer, jbSplitsStore.abi));
    promises.push(deployMockContract(deployer, jbToken.abi));

    let [
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockSplitsStore,
      mockToken,
    ] = await Promise.all(promises);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address,
    );

    await mockTokenStore.mock.issueFor
      .withArgs(PROJECT_ID, NAME, SYMBOL)
      .returns(mockToken.address);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    return {
      projectOwner,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      timestamp,
    };
  }

  it(`Should change current token if caller is project owner and funding cycle not paused`, async function () {
    const {
      projectOwner,
      addrs,
      jbController,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      timestamp,
    } = await setup();
    let newTokenOwner = addrs[0];

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowChangeToken: 1 }),
    });

    await mockTokenStore.mock.changeFor
      .withArgs(PROJECT_ID, mockToken.address, newTokenOwner.address)
      .returns();

    await expect(
      jbController
        .connect(projectOwner)
        .changeTokenOf(PROJECT_ID, mockToken.address, newTokenOwner.address),
    ).to.be.not.reverted;
  });

  it(`Should change current token if caller is not project owner but is authorized`, async function () {
    const {
      projectOwner,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      timestamp,
    } = await setup();
    let newTokenOwner = addrs[0];
    let caller = addrs[1];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, DOMAIN, CHANGE_TOKEN_INDEX)
      .returns(true);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowChangeToken: 1 }),
    });

    await mockTokenStore.mock.changeFor
      .withArgs(PROJECT_ID, mockToken.address, newTokenOwner.address)
      .returns();

    await expect(
      jbController
        .connect(caller)
        .changeTokenOf(PROJECT_ID, mockToken.address, newTokenOwner.address),
    ).to.be.not.reverted;
  });

  it(`Can't change current token if caller is not authorized`, async function () {
    const {
      projectOwner,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      timestamp,
    } = await setup();
    let newTokenOwner = addrs[0];
    let caller = addrs[1];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, DOMAIN, CHANGE_TOKEN_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, CHANGE_TOKEN_INDEX)
      .returns(false);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowChangeToken: 1 }),
    });

    await mockTokenStore.mock.changeFor
      .withArgs(PROJECT_ID, mockToken.address, newTokenOwner.address)
      .returns();

    await expect(
      jbController
        .connect(caller)
        .changeTokenOf(PROJECT_ID, mockToken.address, newTokenOwner.address),
    ).to.be.revertedWith('UNAUTHORIZED()');
  });

  it(`Can't change current token if funding cycle is paused`, async function () {
    const {
      projectOwner,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      timestamp,
    } = await setup();
    let newTokenOwner = addrs[0];

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowChangeToken: 0 }),
    });

    await mockTokenStore.mock.changeFor
      .withArgs(PROJECT_ID, mockToken.address, newTokenOwner.address)
      .returns();

    await expect(
      jbController
        .connect(projectOwner)
        .changeTokenOf(PROJECT_ID, mockToken.address, newTokenOwner.address),
    ).to.revertedWith('CHANGE_TOKEN_NOT_ALLOWED()');
  });
});
