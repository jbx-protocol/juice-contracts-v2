import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount, makeSplits, packFundingCycleMetadata } from '../helpers/utils';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import IJbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

describe('JBController::migrate(...)', function () {
  const PROJECT_ID = 1;
  const TOTAL_SUPPLY = 20000;
  const MINTED = 10000;
  const PROJECT_HANDLE = ethers.utils.formatBytes32String('PROJECT_1');
  const METADATA_CID = '';
  let MIGRATE_CONTROLLER_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    MIGRATE_CONTROLLER_INDEX = await jbOperations.MIGRATE_CONTROLLER();
  });

  async function setup() {
    let [deployer, projectOwner, caller, ...addrs] = await ethers.getSigners();

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
    let mockTerminal1 = await deployMockContract(deployer, jbTerminal.abi);
    let mockTerminal2 = await deployMockContract(deployer, jbTerminal.abi);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    // launch
    await mockJbProjects.mock.createFor
      .withArgs(projectOwner.address, PROJECT_HANDLE, METADATA_CID)
      .returns(PROJECT_ID);

    await mockJbDirectory.mock.setControllerOf
      .withArgs(PROJECT_ID, mockController.address)
      .returns();

    await mockJbDirectory.mock.addTerminalsOf
      .withArgs(PROJECT_ID, [mockTerminal1.address, mockTerminal2.address]);

    // _configure

    const fundingCycleData = makeFundingCycleDataStruct();
    const fundingCycleMetadata = makeFundingCycleMetadata();
    const splits = makeSplits();

    await mockJbFundingCycleStore.configureFor
      .withArgs(PROJECT_ID, fundingCycleData, fundingCycleMetadata.packed)
      .returns(
        Object.assign({
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          metadata: fundingCycleMetadata.packed
        },
          fundingCycleData)
      );

    await mockSplitsStore.mock.set
      .withArgs(PROJECT_ID, /*configuration=*/timestamp, /*group=*/1, splits)
      .returns();



    // ----------------------



    await mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(jbController.address);

    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(TOTAL_SUPPLY);

    await mockController.mock.prepForMigrationOf
      .withArgs(PROJECT_ID, jbController.address)
      .returns();

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
      metadata: packFundingCycleMetadata({ allowControllerMigration: 1 })
    });

    return {
      deployer,
      projectOwner,
      caller,
      addrs,
      jbController,
      mockJbDirectory,
      mockTokenStore,
      mockController,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits
    };
  }

  function makeFundingCycleMetadata({
    reservedRate = 0,
    redemptionRate = 10000,
    ballotRedemptionRate = 10000,
    pausePay = false,
    pauseDistributions = false,
    pauseRedeem = false,
    pauseMint = false,
    pauseBurn = false,
    allowChangeToken = false,
    allowTerminalMigration = false,
    allowControllerMigration = false,
    holdFees = false,
    useLocalBalanceForRedemptions = false,
    useDataSourceForPay = false,
    useDataSourceForRedeem = false,
    dataSource = ethers.constants.AddressZero
  }) {
    const unpackedMetadata = {
      redemptionRate,
      ballotRedemptionRate,
      pausePay,
      pauseDistributions,
      pauseRedeem,
      pauseMint,
      pauseBurn,
      allowChangeToken,
      allowTerminalMigration,
      allowControllerMigration,
      holdFees,
      useLocalBalanceForRedemptions,
      useDataSourceForPay,
      useDataSourceForRedeem,
      dataSource
    };

    return { unpacked: unpackedMetadata, packed: packFundingCycleMetadata(unpackedMetadata) }
  };

  function makeFundingCycleDataStruct({
    duration = 0,
    weight = 10 ** 18,
    discountRate = 900000000,
    ballot = ethers.constants.AddressZero
  }) {
    return { duration, weight, discountRate, ballot }
  }

  function makeFundAccessConstraints({
    terminal = ethers.constants.AddressZero,
    distributionLimit = 0,
    overflowAllowance = 0,
    currency = 0,
    count = 2
  }) {
    let constraints = [];
    for (let i = 0; i < count; i++) {
      constraints.push({
        terminal,
        distributionLimit,
        overflowAllowance,
        currency
      })
    }
    return constraints;
  }

  it(`Should launch project`, async function () {
    const { jbController, projectOwner, mockController, timestamp, fundingCycleData,
      fundingCycleMetadata,
      splits } = await setup();

    const groupedSplits = { group: 1, splits };
    const fundAccessConstraints = makeFundAccessConstraints();

    let tx = jbController.connect(projectOwner).launchProjectFor(
      projectOwner.address,
      PROJECT_HANDLE,
      METADATA_CID,
      fundingCycleData,
      fundingCycleMetadata.unpacked,
      groupedSplits,
      fundAccessConstraints,
      []
    );

    expect(await tx).to.be.not.reverted;

  });

});