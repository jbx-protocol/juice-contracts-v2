import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata } from '../helpers/utils';
import errors from '../helpers/errors.json';

import JbController from '../../artifacts/contracts/JBController.sol/JBController.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';

describe('JBController::launchFundingCycleFor(...)', function () {
  const EXISTING_PROJECT = 1;
  const LAUNCHED_PROJECT = 2;
  const NONEXISTANT_PROJECT = 3
  const METADATA_CID = '';
  const METADATA_DOMAIN = 1234;
  const PROJECT_START = '1';
  let RECONFIGURE_INDEX;
  let MIGRATE_CONTROLLER_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    RECONFIGURE_INDEX = await jbOperations.RECONFIGURE();
    MIGRATE_CONTROLLER_INDEX = await jbOperations.MIGRATE_CONTROLLER();
  });

  async function setup() {
    let [deployer, projectOwner, nonOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;
    const fundingCycleData = makeFundingCycleDataStruct();
    const fundingCycleMetadata = makeFundingCycleMetadata();
    const splits = makeSplits();

    let [
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbTerminal1,
      mockJbTerminal2,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, JbController.abi),
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbFundingCycleStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbTerminal.abi),
      deployMockContract(deployer, jbTerminal.abi),
      deployMockContract(deployer, jbTokenStore.abi),
    ]);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
    );

    await mockJbProjects.mock.createFor
      .withArgs(projectOwner.address, [METADATA_CID, METADATA_DOMAIN])
      .returns(EXISTING_PROJECT);

    await mockJbProjects.mock.ownerOf
      .withArgs(EXISTING_PROJECT)
      .returns(projectOwner.address);

    await mockJbProjects.mock.ownerOf
      .withArgs(LAUNCHED_PROJECT)
      .returns(projectOwner.address);

    await mockJbProjects.mock.ownerOf
      .withArgs(NONEXISTANT_PROJECT)
      .reverts();

    await mockJbDirectory.mock.setControllerOf.withArgs(EXISTING_PROJECT, jbController.address).returns();

    await mockJbDirectory.mock.addTerminalsOf
      .withArgs(EXISTING_PROJECT, [mockJbTerminal1.address, mockJbTerminal2.address])
      .returns();

    await mockJbFundingCycleStore.mock.configureFor
      .withArgs(EXISTING_PROJECT, fundingCycleData, fundingCycleMetadata.packed, PROJECT_START)
      .returns(
        Object.assign(
          {
            number: EXISTING_PROJECT,
            configuration: timestamp,
            basedOn: timestamp,
            start: timestamp,
            metadata: fundingCycleMetadata.packed,
          },
          fundingCycleData,
        ),
      );

    await mockJbFundingCycleStore.mock.latestConfigurationOf
      .withArgs(EXISTING_PROJECT)
      .returns(0);

    await mockJbFundingCycleStore.mock.latestConfigurationOf
      .withArgs(LAUNCHED_PROJECT)
      .returns(1);

    await mockJbSplitsStore.mock.set
      .withArgs(EXISTING_PROJECT, /*configuration=*/ timestamp, /*group=*/ 1, splits)
      .returns();

    return {
      deployer,
      projectOwner,
      nonOwner,
      addrs,
      jbController,
      mockJbDirectory,
      mockJbTokenStore,
      mockJbController,
      mockJbProjects,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      mockJbTerminal1,
      mockJbTerminal2,
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
    distributionLimit = 200,
    distributionLimitCurrency = 1,
    overflowAllowance = 100,
    overflowAllowanceCurrency = 2,
  } = {}) {
    let constraints = [];
    for (let terminal of terminals) {
      constraints.push({
        terminal,
        distributionLimit,
        distributionLimitCurrency,
        overflowAllowance,
        overflowAllowanceCurrency,
      });
    }
    return constraints;
  }

  it(`Should launch a funding cycle for an existing project and emit events`, async function () {
    const {
      jbController,
      projectOwner,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    expect(
      await jbController
        .connect(projectOwner)
        .callStatic.launchFundingCycleFor(
          EXISTING_PROJECT,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          PROJECT_START,
          groupedSplits,
          fundAccessConstraints,
          terminals,
        ),
    ).to.equal(timestamp);

    let tx = jbController
      .connect(projectOwner)
      .launchFundingCycleFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
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
            EXISTING_PROJECT,
            [
              constraints.terminal,
              constraints.distributionLimit,
              constraints.distributionLimitCurrency,
              constraints.overflowAllowance,
              constraints.overflowAllowanceCurrency,
            ],
            projectOwner.address,
          );

        const args = [EXISTING_PROJECT, timestamp, constraints.terminal];
        expect(await jbController.distributionLimitOf(...args)).equals(
          constraints.distributionLimit,
        );
        expect(await jbController.distributionLimitCurrencyOf(...args)).equals(
          constraints.distributionLimitCurrency,
        );
        expect(await jbController.overflowAllowanceOf(...args)).equals(
          constraints.overflowAllowance,
        );
        expect(await jbController.overflowAllowanceCurrencyOf(...args)).equals(
          constraints.overflowAllowanceCurrency,
        );
      }),
    );
  });

  it(`Should launch a funding cycle without payment terminals and funding cycle constraints`, async function () {
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
        .callStatic.launchFundingCycleFor(
          EXISTING_PROJECT,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          PROJECT_START,
          groupedSplits,
          fundAccessConstraints,
          [],
        ),
    ).to.equal(timestamp);

    // No constraint => no event
    await expect(
      jbController
        .connect(projectOwner)
        .launchFundingCycleFor(
          EXISTING_PROJECT,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          PROJECT_START,
          groupedSplits,
          fundAccessConstraints,
          [],
        ),
    ).to.not.emit(jbController, 'SetFundAccessConstraints');
  });

  it(`Can't launch a project with a reserved rate superior to 10000`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });
    const fundingCycleMetadata = makeFundingCycleMetadata({ reservedRate: 10001 });

    let tx = jbController
      .connect(projectOwner)
      .launchFundingCycleFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_RESERVED_RATE);
  });

  it(`Can't launch a project with a redemption rate superior to 10000`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    fundingCycleMetadata.unpacked.redemptionRate = 10001; //not possible in packed metadata (shl of a negative value)

    let tx = jbController
      .connect(projectOwner)
      .launchFundingCycleFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
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
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();

    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    fundingCycleMetadata.unpacked.ballotRedemptionRate = 10001; //not possible in packed metadata (shl of a negative value)

    let tx = jbController
      .connect(projectOwner)
      .launchFundingCycleFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_BALLOT_REDEMPTION_RATE);
  });

  it(`Can't be called for a non-existant project`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    let tx = jbController
      .connect(projectOwner)
      .callStatic.launchFundingCycleFor(
        NONEXISTANT_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.reverted;
  });

  it(`Can't be called for a project by a non-owner`, async function () {
    const {
      jbController,
      projectOwner,
      nonOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
      mockJbOperatorStore
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(nonOwner.address, projectOwner.address, EXISTING_PROJECT, RECONFIGURE_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(nonOwner.address, projectOwner.address, 0, RECONFIGURE_INDEX)
      .returns(false);

    let tx = jbController
      .connect(nonOwner)
      .callStatic.launchFundingCycleFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it(`Can't launch for a project with an existing funding cycle`, async function () {
    const {
      jbController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    let tx = jbController
      .connect(projectOwner)
      .callStatic.launchFundingCycleFor(
        LAUNCHED_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
      );

    await expect(tx).to.be.revertedWith(errors.FUNDING_CYCLE_ALREADY_LAUNCHED);
  });
})