import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../helpers/utils.js';
import errors from '../helpers/errors.json';

import jbAllocator from '../../artifacts/contracts/interfaces/IJBSplitAllocator.sol/IJBSplitAllocator.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JbEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbFeeGauge from '../../artifacts/contracts/interfaces/IJBFeeGauge.sol/IJBFeeGauge.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';

describe('JBPaymentTerminal::distributePayoutsOf(...)', function () {
  const PLATFORM_PROJECT_ID = 1;
  const PROJECT_ID = 2;
  const OTHER_PROJECT_ID = 3;

  const AMOUNT_TO_DISTRIBUTE = 500000000000;
  const AMOUNT_DISTRIBUTED = 1000000000000;

  const DEFAULT_FEE = 25000000; // 2.5%
  const FEE_DISCOUNT = 500000000; // 50%

  const CURRENCY = 1;
  const MIN_TOKEN_REQUESTED = 180;
  const MEMO = 'Memo Test';

  let ETH_ADDRESS;
  let ETH_PAYOUT_INDEX;
  let SPLITS_TOTAL_PERCENT;
  let MAX_FEE;
  let MAX_FEE_DISCOUNT;
  let AMOUNT_MINUS_FEES;
  let DISCOUNTED_FEE;

  let fundingCycle;

  before(async function () {
    let jbTokenFactory = await ethers.getContractFactory('JBTokens');
    let jbToken = await jbTokenFactory.deploy();

    let jbSplitsGroupsFactory = await ethers.getContractFactory('JBSplitsGroups');
    let jbSplitsGroups = await jbSplitsGroupsFactory.deploy();

    let jbConstantsFactory = await ethers.getContractFactory('JBConstants');
    let jbConstants = await jbConstantsFactory.deploy();

    ETH_PAYOUT_INDEX = await jbSplitsGroups.ETH_PAYOUT();
    ETH_ADDRESS = await jbToken.ETH();
    SPLITS_TOTAL_PERCENT = await jbConstants.SPLITS_TOTAL_PERCENT();
    MAX_FEE_DISCOUNT = await jbConstants.MAX_FEE_DISCOUNT();
    MAX_FEE = (await jbConstants.MAX_FEE()).toNumber();

    let FEE = AMOUNT_DISTRIBUTED - Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DEFAULT_FEE + MAX_FEE));
    AMOUNT_MINUS_FEES = AMOUNT_DISTRIBUTED - FEE;
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    };

    let [
      mockJbAllocator,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbAllocator.abi),
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JbEthPaymentTerminal.abi),
      deployMockContract(deployer, JBPaymentTerminalStore.abi),
      deployMockContract(deployer, jbFeeGauge.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);

    let jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJBPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Used with hardcoded one to get JBDao terminal
    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(jbEthPaymentTerminal.address);

    await mockJBPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    await setBalance(jbEthPaymentTerminal.address, AMOUNT_DISTRIBUTED);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      addrs,
      jbEthPaymentTerminal,
      mockJbAllocator,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbProjects,
      mockJbSplitsStore,
      timestamp,
    };
  }

  it('Should distribute payout without fee when fee is set to 0 and emit event', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*amount*/ AMOUNT_TO_DISTRIBUTE,
        /*distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and emit event, without fee if project is Juicebox DAO', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJBPaymentTerminalStore,
      mockJbProjects,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbProjects.mock.ownerOf.withArgs(PLATFORM_PROJECT_ID).returns(projectOwner.address);

    await mockJBPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PLATFORM_PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(
        {
          // mock JBFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata({ holdFees: 0 }),
        },
        AMOUNT_DISTRIBUTED,
      );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PLATFORM_PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PLATFORM_PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PLATFORM_PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PLATFORM_PROJECT_ID,
        projectOwner.address,
        AMOUNT_TO_DISTRIBUTE,
        AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and emit event, without fee if the beneficiary is another project within the same terminal', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(jbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJBPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            jbEthPaymentTerminal.address,
            /*amount paid*/ Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            split.projectId,
            split.beneficiary,
            ''
          )
          .returns(fundingCycle, 0, 0, /* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          )
          .and.to.emit(jbEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            split.projectId,
            split.beneficiary,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            0,
            0,
            '',
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus fee, hold the fee in the contract and emit event', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJBPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJBPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(
        {
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata({ holdFees: 1 }),
        },
        AMOUNT_DISTRIBUTED,
      );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );

    expect(await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([
      [ethers.BigNumber.from(AMOUNT_DISTRIBUTED), DEFAULT_FEE, projectOwner.address],
    ]);
  });

  it('Should distribute payout minus fee and pay the fee via Juicebox DAO terminal, if using another terminal', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbEthPaymentTerminal,
      mockJbDirectory,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        1, //JBX Dao
        projectOwner.address,
        0,
        /*preferedClaimedToken*/ false,
        '',
        '0x',
      )
      .returns();

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout without fee if distributing to a project in another terminal not subject to fees', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            /*payoutAmount*/ Math.floor(
            (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
          ),
            split.projectId,
            split.beneficiary,
            /*minReturnedToken*/ 0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns();
      }),
    );

    await jbEthPaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbEthPaymentTerminal.address);

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus fee and pay the fee via the same terminal, if using Juicebox DAO terminal', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJBPaymentTerminalStore,
      mockJbDirectory,
      mockJbSplitsStore,
    } = await setup();
    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DEFAULT_FEE + MAX_FEE));
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJBPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        jbEthPaymentTerminal.address,
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*CURRENCY*/ 1,
        projectOwner.address,
        ''
      )
      .returns(fundingCycle, 0, 0, /* delegate */ ethers.constants.AddressZero, '');

    await Promise.all(
      splits.map(async (split) => {
        await mockJBPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            jbEthPaymentTerminal.address,
            /*amount paid*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            split.projectId,
            split.beneficiary,
            ''
          )
          .returns(fundingCycle, 0, 0,/* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          )
          .and.to.emit(jbEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            /*projectId*/1,
            projectOwner.address,
            Math.floor(AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES),
            0,
            0,
            '',
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus discounted fee if a fee gauge is set', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbFeeGauge,
      mockJbSplitsStore,
    } = await setup();

    const DISCOUNTED_FEE =
      DEFAULT_FEE - Math.floor((DEFAULT_FEE * FEE_DISCOUNT) / MAX_FEE_DISCOUNT);
    const AMOUNT_MINUS_FEES = Math.floor(
      (AMOUNT_DISTRIBUTED * MAX_FEE) / (MAX_FEE + DISCOUNTED_FEE),
    );
    const FEE_AMOUNT = AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES;

    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await jbEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(FEE_DISCOUNT);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        FEE_AMOUNT,
        1, //JBX Dao
        projectOwner.address,
        0,
        false,
        '',
        '0x',
      )
      .returns();

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            split.projectId, //JBX Dao
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns();
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ FEE_AMOUNT,
        /*_leftoverDistributionAmount*/0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus non-discounted fee if the discount is above 100%', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbFeeGauge,
      mockJbSplitsStore,
    } = await setup();

    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (MAX_FEE + DEFAULT_FEE));

    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await jbEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(MAX_FEE_DISCOUNT + 1);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES, // 0 if fee is in ETH (as the amount is then in msg.value)
        1, //JBX Dao
        projectOwner.address,
        0,
        false,
        '',
        '0x',
      )
      .returns();

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            1, //JBX Dao
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns();
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the allocator if set in splits', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      jbEthPaymentTerminal,
      timestamp,
      mockJbAllocator,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, allocator: mockJbAllocator.address });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbAllocator.mock.allocate
          .withArgs(
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            PROJECT_ID,
            ETH_PAYOUT_INDEX,
            split,
          )
          .returns();
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the terminal of the project if project id is set in splits', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            /*payoutAmount*/ Math.floor(
            (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
          ),
            split.projectId,
            split.beneficiary,
            /*minReturnedToken*/ 0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns();
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use this terminal if the project set in splits uses it', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(jbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJBPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            jbEthPaymentTerminal.address,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            split.projectId,
            split.beneficiary,
            ''
          )
          .returns(fundingCycle, 0, 0, /* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          )
          .and.to.emit(jbEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            split.projectId,
            split.beneficiary,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            0,
            0,
            '',
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should send any leftover after distributing to the projectOwner', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const PERCENT = SPLITS_TOTAL_PERCENT / 10;
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      percent: PERCENT,
    });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ AMOUNT_DISTRIBUTED -
        ((AMOUNT_DISTRIBUTED * PERCENT) / SPLITS_TOTAL_PERCENT) * splits.length,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout of 0 and emit event', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJBPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJBPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, 0);

    let tx = await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, ETH_PAYOUT_INDEX, 0, MEMO);

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            /*_fundingCycle.configuration*/ timestamp,
            /*_fundingCycle.number*/ 1,
            PROJECT_ID,
            [
              split.preferClaimed,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((0 * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ 0,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it("Can't have a zero address terminal for a project set in split", async function () {
    const {
      terminalOwner,
      caller,
      jbEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(ethers.constants.AddressZero);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(0, split.projectId, split.beneficiary, 0, split.preferClaimed, '', '0x')
          .returns();
      }),
    );

    await expect(
      jbEthPaymentTerminal
        .connect(caller)
        .distributePayoutsOf(
          PROJECT_ID,
          AMOUNT_TO_DISTRIBUTE,
          ETH_PAYOUT_INDEX,
          MIN_TOKEN_REQUESTED,
          MEMO,
        ),
    ).to.be.revertedWith(errors.TERMINAL_IN_SPLIT_ZERO_ADDRESS);
  });
  it("Cant distribute payouts of the distributed amount is less than expected", async function () {
    const {
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await expect(
      jbEthPaymentTerminal
        .connect(caller)
        .distributePayoutsOf(
          PROJECT_ID,
          AMOUNT_TO_DISTRIBUTE,
          ETH_PAYOUT_INDEX,
          AMOUNT_DISTRIBUTED + 1,
          MEMO,
        ),
    ).to.be.revertedWith(errors.INADEQUATE_DISTRIBUTION_AMOUNT);
  });
});
