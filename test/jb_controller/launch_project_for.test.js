import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata } from '../helpers/utils';
import errors from '../helpers/errors.json';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import IJbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

describe('JBController::launchProjectFor(...)', function () {
  const PROJECT_ID = 1;
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
    const fundingCycleData = makeFundingCycleDataStruct();
    const fundingCycleMetadata = makeFundingCycleMetadata();
    const splits = makeSplits();

    let promises = [];

    promises.push(deployMockContract(deployer, jbOperatoreStore.abi));
    promises.push(deployMockContract(deployer, jbProjects.abi));
    promises.push(deployMockContract(deployer, jbDirectory.abi));
    promises.push(deployMockContract(deployer, jbFundingCycleStore.abi));
    promises.push(deployMockContract(deployer, jbTokenStore.abi));
    promises.push(deployMockContract(deployer, jbSplitsStore.abi));
    promises.push(deployMockContract(deployer, IJbController.abi));
    promises.push(deployMockContract(deployer, jbTerminal.abi));
    promises.push(deployMockContract(deployer, jbTerminal.abi));

    let [
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockSplitsStore,
      mockController,
      mockTerminal1,
      mockTerminal2,
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

    await mockJbProjects.mock.createFor
      .withArgs(projectOwner.address, PROJECT_HANDLE, METADATA_CID)
      .returns(PROJECT_ID);

    await mockJbDirectory.mock.setControllerOf.withArgs(PROJECT_ID, jbController.address).returns();

    await mockJbDirectory.mock.addTerminalsOf
      .withArgs(PROJECT_ID, [mockTerminal1.address, mockTerminal2.address])
      .returns();

    await mockJbFundingCycleStore.mock.configureFor
      .withArgs(PROJECT_ID, fundingCycleData, fundingCycleMetadata.packed)
      .returns(
        Object.assign(
          {
            number: 1,
            configuration: timestamp,
            basedOn: timestamp,
            start: timestamp,
            metadata: fundingCycleMetadata.packed,
          },
          fundingCycleData,
        ),
      );

    await mockSplitsStore.mock.set
      .withArgs(PROJECT_ID, /*configuration=*/ timestamp, /*group=*/ 1, splits)
      .returns();

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
      mockTerminal1,
      mockTerminal2,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
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
    dataSource = ethers.constants.AddressZero,
  } = {}) {
    const unpackedMetadata = {
      reservedRate,
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
      dataSource,
    };
    return { unpacked: unpackedMetadata, packed: packFundingCycleMetadata(unpackedMetadata) };
  }

  function makeFundingCycleDataStruct({
    duration = 0,
    weight = ethers.BigNumber.from('1' + '0'.repeat(18)),
    discountRate = 900000000,
    ballot = ethers.constants.AddressZero,
  } = {}) {
    return { duration, weight, discountRate, ballot };
  }

  function makeFundingAccessConstraints({
    terminals,
    distributionLimit = 10,
    overflowAllowance = 10,
    currency = 1,
  } = {}) {
    let constraints = [];
    for (let terminal of terminals) {
      constraints.push({
        terminal,
        distributionLimit,
        overflowAllowance,
        currency,
      });
    }
    return constraints;
  }

  it(`Should launch a project and emit events`, async function () {
    const {
      jbController,
      projectOwner,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockTerminal1,
      mockTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    expect(
      await jbController
        .connect(projectOwner)
        .callStatic.launchProjectFor(
          projectOwner.address,
          PROJECT_HANDLE,
          METADATA_CID,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          groupedSplits,
          fundAccessConstraints,
          terminals,
        ),
    ).to.equal(PROJECT_ID);

    let tx = jbController
      .connect(projectOwner)
      .launchProjectFor(
        projectOwner.address,
        PROJECT_HANDLE,
        METADATA_CID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await Promise.all(
      fundAccessConstraints.map(async (constraints) => {
        await expect(tx)
          .to.emit(jbController, 'SetFundAccessConstraints')
          .withArgs(
            /*fundingCycleData.configuration=*/ timestamp,
            /*fundingCycleData.number=*/ 1,
            PROJECT_ID,
            [
              constraints.terminal,
              constraints.distributionLimit,
              constraints.overflowAllowance,
              constraints.currency,
            ],
            projectOwner.address,
          );
      }),
    );
  });

  it(`Should launch a project without payment terminals and funding cycle constraints`, async function () {
    const {
      jbController,
      projectOwner,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const fundAccessConstraints = [];

    expect(
      await jbController
        .connect(projectOwner)
        .callStatic.launchProjectFor(
          projectOwner.address,
          PROJECT_HANDLE,
          METADATA_CID,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          groupedSplits,
          fundAccessConstraints,
          [],
        ),
    ).to.equal(PROJECT_ID);

    // No constraint => no event
    await expect(jbController
      .connect(projectOwner)
      .launchProjectFor(
        projectOwner.address,
        PROJECT_HANDLE,
        METADATA_CID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
        [],
      )
    ).to.not.emit(jbController, 'SetFundAccessConstraints');
  });

  it(`Can't launch a project with a reserved rate superior to 10000`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      splits,
      mockTerminal1,
      mockTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });
    const fundingCycleMetadata = makeFundingCycleMetadata({ reservedRate: 10001 });

    let tx = jbController
      .connect(projectOwner)
      .launchProjectFor(
        projectOwner.address,
        PROJECT_HANDLE,
        METADATA_CID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith('INVALID_RESERVED_RATE()');
  });

  it(`Can't launch a project with a redemption rate superior to 10000`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockTerminal1,
      mockTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    fundingCycleMetadata.unpacked.redemptionRate = 10001; //not possible in packed metadata (shl of a negative value)

    let tx = jbController
      .connect(projectOwner)
      .launchProjectFor(
        projectOwner.address,
        PROJECT_HANDLE,
        METADATA_CID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_REDEMPTION_RATE);
  });

  it(`Can't launch a project with a ballot redemption rate superior to 10000`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockTerminal1,
      mockTerminal2,
    } = await setup();

    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    fundingCycleMetadata.unpacked.ballotRedemptionRate = 10001; //not possible in packed metadata (shl of a negative value)

    let tx = jbController
      .connect(projectOwner)
      .launchProjectFor(
        projectOwner.address,
        PROJECT_HANDLE,
        METADATA_CID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_BALLOT_REDEMPTION_RATE);
  });
});
