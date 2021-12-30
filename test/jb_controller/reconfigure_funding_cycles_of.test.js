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

describe('JBController::reconfigureFundingCycleOf(...)', function () {
  const PROJECT_ID = 1;
  const TOTAL_SUPPLY = 20000;
  const MINTED = 10000;
  const PROJECT_HANDLE = ethers.utils.formatBytes32String('PROJECT_1');
  const METADATA_CID = '';
  let RECONFIGURE_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    RECONFIGURE_INDEX = await jbOperations.RECONFIGURE();
  });

  async function setup() {
    let [deployer, projectOwner, caller, ...addrs] = await ethers.getSigners();

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

    const fundingCycleData = makeFundingCycleDataStruct();
    const fundingCycleMetadata = makeFundingCycleMetadata();
    const splits = makeSplits();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

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

  it(`Should reconfigure funding cycle and emit events if caller is project owner`, async function () {
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
        .callStatic.reconfigureFundingCyclesOf(
          PROJECT_ID,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          groupedSplits,
          fundAccessConstraints,
        ),
    ).to.equal(timestamp);

    let tx = jbController
      .connect(projectOwner)
      .reconfigureFundingCyclesOf(
        PROJECT_ID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
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

  it(`Should reconfigure funding cycle and emit events if caller is not project owner but is authorized`, async function () {
    const {
      jbController,
      projectOwner,
      addrs,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbOperatorStore,
      mockTerminal1,
      mockTerminal2,
    } = await setup();
    const caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, RECONFIGURE_INDEX)
      .returns(true);

    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    expect(
      await jbController
        .connect(caller)
        .callStatic.reconfigureFundingCyclesOf(
          PROJECT_ID,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          groupedSplits,
          fundAccessConstraints,
        ),
    ).to.equal(timestamp);

    let tx = jbController
      .connect(caller)
      .reconfigureFundingCyclesOf(
        PROJECT_ID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
      );

    await Promise.all(
      fundAccessConstraints.map(async (constraints) => {
        await expect(tx)
          .to.emit(jbController, 'SetFundAccessConstraints')
          .withArgs(
            timestamp,
            1,
            PROJECT_ID,
            [
              constraints.terminal,
              constraints.distributionLimit,
              constraints.overflowAllowance,
              constraints.currency,
            ],
            caller.address,
          );
      }),
    );
  });

  it(`Can't reconfigure funding cycle if caller is not authorized`, async function () {
    const {
      jbController,
      projectOwner,
      addrs,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbOperatorStore,
      mockTerminal1,
      mockTerminal2,
    } = await setup();

    const caller = addrs[0];
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, RECONFIGURE_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, RECONFIGURE_INDEX)
      .returns(false);

    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    let tx = jbController
      .connect(caller)
      .reconfigureFundingCyclesOf(
        PROJECT_ID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
      );

    await expect(tx).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it(`Can't set a reserved rate superior to 10000`, async function () {
    const { jbController, projectOwner, fundingCycleData, splits, mockTerminal1, mockTerminal2 } =
      await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockTerminal1.address, mockTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });
    const fundingCycleMetadata = makeFundingCycleMetadata({ reservedRate: 10001 });

    let tx = jbController
      .connect(projectOwner)
      .reconfigureFundingCyclesOf(
        PROJECT_ID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
      );

    await expect(tx).to.be.revertedWith('0x51: BAD_RESERVED_RATE');
  });

  it(`Can't set a redemption rate superior to 10000`, async function () {
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
      .reconfigureFundingCyclesOf(
        PROJECT_ID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
      );

    await expect(tx).to.be.revertedWith('0x52: BAD_REDEMPTION_RATE');
  });

  it(`Can't set a ballot redemption rate superior to 10000`, async function () {
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
      .reconfigureFundingCyclesOf(
        PROJECT_ID,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        groupedSplits,
        fundAccessConstraints,
      );

    await expect(tx).to.be.revertedWith('0x53: BAD_BALLOT_REDEMPTION_RATE');
  });
});
