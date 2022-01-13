import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata } from '../helpers/utils.js';
import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JbEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';

describe.only('JBETHPaymentTerminal::distributePayoutsOf(...)', function () {
  const PROJECT_ID = 2;
  const PLATFORM_PROJECT_ID = 1;

  const AMOUNT_DISTRIBUTED = 200;
  const DEFAULT_FEE = 10; // 5%

  const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * 200) / (DEFAULT_FEE + 200));


  const CURRENCY = 1;
  const MIN_TOKEN_REQUESTED = 180;
  const HANDLE = ethers.utils.formatBytes32String('PROJECT_HANDLE');
  const PADDING = '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00';
  const NAME = "Foo";
  const SYMBOL = "BAR";

  const NEW_FEE = 20; // 10%
  const MEMO = 'Memo Test';

  let fundingCycle;

  const DELEGATE_METADATA = ethers.utils.randomBytes(32);
  const FUNDING_CYCLE_NUMBER = 1;
  const WEIGHT = 10;
  const TOKEN_RECEIVED = 100;
  const ETH_TO_PAY = ethers.utils.parseEther('1');

  let ETH_ADDRESS;
  let ETH_PAYOUT_INDEX;
  let SPLITS_TOTAL_PERCENT;


  before(async function () {
    let jbTokenFactory = await ethers.getContractFactory('JBTokens');
    let jbToken = await jbTokenFactory.deploy();

    let jbSplitsGroupsFactory = await ethers.getContractFactory('JBSplitsGroups')
    let jbSplitsGroups = await jbSplitsGroupsFactory.deploy();

    let jbConstantsFactory = await ethers.getContractFactory('JBConstants');
    let jbConstants = await jbConstantsFactory.deploy();

    ETH_PAYOUT_INDEX = await jbSplitsGroups.ETH_PAYOUT();
    ETH_ADDRESS = await jbToken.ETH();
    SPLITS_TOTAL_PERCENT = await jbConstants.SPLITS_TOTAL_PERCENT();
  });


  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] = await ethers.getSigners();

 console.log([deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo].map( i => i.address));

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
    }

    let [
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockJbSplitsStore,
      mockJbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
    ] = await Promise.all([
        deployMockContract(deployer, jbOperatoreStore.abi),
        deployMockContract(deployer, jbProjects.abi),
        deployMockContract(deployer, jbDirectory.abi),
        deployMockContract(deployer, jbSplitsStore.abi),
        deployMockContract(deployer, JbEthPaymentTerminal.abi),
        deployMockContract(deployer, jbEthPaymentTerminalStore.abi),
      ]);

      [
        mockJbOperatorStore,
        mockJbProjects,
        mockJbDirectory,
        mockJbSplitsStore,
        mockJbEthPaymentTerminal,
        mockJbEthPaymentTerminalStore,
      ].map( elt => console.log(elt.address));
    

    let jbTerminalFactory = await ethers.getContractFactory("JBETHPaymentTerminal", deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

    await mockJbEthPaymentTerminalStore.mock.claimFor
      .withArgs(futureTerminalAddress)
      .returns();

    let jbEthPaymentTerminal = await jbTerminalFactory.connect(deployer).deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbSplitsStore.address,
      mockJbEthPaymentTerminalStore.address,
      terminalOwner.address);
    
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbProjects.mock.handleOf.withArgs(PROJECT_ID).returns(HANDLE);

    // Used with hardcoded one to get JBDao address
    await mockJbDirectory.mock.primaryTerminalOf.withArgs(1, ETH_ADDRESS).returns(jbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(
        PROJECT_ID,
        AMOUNT_DISTRIBUTED,
        CURRENCY,
        MIN_TOKEN_REQUESTED
      )
      .returns(
        fundingCycle,
        AMOUNT_DISTRIBUTED
      )

    await ethers.provider.send('hardhat_setBalance', [jbEthPaymentTerminal.address, '0x'+AMOUNT_DISTRIBUTED.toString(16)]);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      addrs,
      jbEthPaymentTerminal,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      mockJbProjects,
      mockJbSplitsStore,
      timestamp,
    }
  }

  it('Should distribute payout and emit event, without fee is fee is set at 0', async function () {
    const { projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbEthPaymentTerminal, mockJbSplitsStore } = await setup();

    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PROJECT_ID,
                AMOUNT_DISTRIBUTED,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
        .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
        .withArgs(
          /*_fundingCycle.configuration*/timestamp,
          /*_fundingCycle.number*/1,
          PROJECT_ID,
          [
            split.preferClaimed,
            split.percent,
            split.lockedUntil,
            split.beneficiary,
            split.allocator,
            split.projectId,
          ],
          /*payoutAmount*/ Math.floor(AMOUNT_DISTRIBUTED * split.percent / SPLITS_TOTAL_PERCENT),
          caller.address
        )
      })
    );

    expect(await(tx))
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/timestamp,
        /*_fundingCycle.number*/1,
        /*_projectId*/PROJECT_ID,
        /*_projectOwner*/projectOwner.address,
        /*_amount*/AMOUNT_DISTRIBUTED,
        /*_distributedAmount*/AMOUNT_DISTRIBUTED,
        /*_feeAmount*/0,
        /*_leftoverDistributionAmount*/0,
        /*_memo*/MEMO,
        /*msg.sender*/caller.address
      );
  });

  it('Should distribute payout and emit event, without fee if project is Juicebox DAO', async function () {
    const { projectOwner, caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbEthPaymentTerminal, mockJbEthPaymentTerminalStore, mockJbProjects, mockJbSplitsStore } = await setup();
    //const AMOUNT_MINUS_FEES = AMOUNT_DISTRIBUTED - ( (AMOUNT_DISTRIBUTED * 200) / (DEFAULT_FEE + 200) )
    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbProjects.mock.ownerOf.withArgs(PLATFORM_PROJECT_ID).returns(projectOwner.address);
    await mockJbProjects.mock.handleOf.withArgs(PLATFORM_PROJECT_ID).returns(HANDLE);

    await mockJbEthPaymentTerminalStore.mock.recordDistributionFor
    .withArgs(
      PLATFORM_PROJECT_ID,
      AMOUNT_DISTRIBUTED,
      CURRENCY,
      MIN_TOKEN_REQUESTED
    )
    .returns(
      { // mock JBFundingCycle obj 
        number: 1,
        configuration: timestamp,
        basedOn: timestamp,
        start: timestamp,
        duration: 0,
        weight: 0,
        discountRate: 0,
        ballot: ethers.constants.AddressZero,
        metadata: packFundingCycleMetadata( { holdFees: 0 } ),
      },
      AMOUNT_DISTRIBUTED
    )

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PLATFORM_PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PLATFORM_PROJECT_ID,
                AMOUNT_DISTRIBUTED,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
        .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
        .withArgs(
          /*_fundingCycle.configuration*/timestamp,
          /*_fundingCycle.number*/1,
          PLATFORM_PROJECT_ID,
          [
            split.preferClaimed,
            split.percent,
            split.lockedUntil,
            split.beneficiary,
            split.allocator,
            split.projectId,
          ],
          /*payoutAmount*/ Math.floor(AMOUNT_DISTRIBUTED * split.percent / SPLITS_TOTAL_PERCENT),
          caller.address
        )
      })
    );

    expect(await(tx))
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/timestamp,
        /*_fundingCycle.number*/1,
        /*_projectId*/PLATFORM_PROJECT_ID,
        /*_projectOwner*/projectOwner.address,
        /*_amount*/AMOUNT_DISTRIBUTED,
        /*_distributedAmount*/AMOUNT_DISTRIBUTED,
        /*_feeAmount*/0,
        /*_leftoverDistributionAmount*/0,
        /*_memo*/MEMO,
        /*msg.sender*/caller.address
      );
  });

  it('Should distribute payout minus fee, hold the fee in the contract and emit event', async function () {
    const { projectOwner, caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbEthPaymentTerminal, mockJbEthPaymentTerminalStore, mockJbSplitsStore } = await setup();

    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbEthPaymentTerminalStore.mock.recordDistributionFor
    .withArgs(
      PROJECT_ID,
      AMOUNT_DISTRIBUTED,
      CURRENCY,
      MIN_TOKEN_REQUESTED
    )
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
        metadata: packFundingCycleMetadata( { holdFees: 1 } ),
      },
      AMOUNT_DISTRIBUTED
    )

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PROJECT_ID,
                AMOUNT_DISTRIBUTED,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
        .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
        .withArgs(
          /*_fundingCycle.configuration*/timestamp,
          /*_fundingCycle.number*/1,
          PROJECT_ID,
          [
            split.preferClaimed,
            split.percent,
            split.lockedUntil,
            split.beneficiary,
            split.allocator,
            split.projectId,
          ],
          /*payoutAmount*/ Math.floor(AMOUNT_MINUS_FEES * split.percent / SPLITS_TOTAL_PERCENT),
          caller.address
        )
      })
    );

    expect(await(tx))
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/timestamp,
        /*_fundingCycle.number*/1,
        /*_projectId*/PROJECT_ID,
        /*_projectOwner*/projectOwner.address,
        /*_amount*/AMOUNT_DISTRIBUTED,
        /*_distributedAmount*/AMOUNT_DISTRIBUTED,
        /*_feeAmount*/AMOUNT_DISTRIBUTED-AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/0,
        /*_memo*/MEMO,
        /*msg.sender*/caller.address
      );

    expect(await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([[
        ethers.BigNumber.from(AMOUNT_DISTRIBUTED),
        DEFAULT_FEE,
        projectOwner.address,
        'Fee from @'+ethers.utils.parseBytes32String(HANDLE)+PADDING
    ]]);

  });

  it('Should distribute payout minus fee and pay the fee via Juicebox DAO terminal, if using another terminal', async function () {
    const { projectOwner, caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbEthPaymentTerminal, mockJbDirectory, mockJbSplitsStore } = await setup();
    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * 200) / (DEFAULT_FEE + 200));

    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf.withArgs(1, ETH_ADDRESS).returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
     .withArgs(
      1, //JBX Dao
      projectOwner.address,
      0,
      false,
      'Fee from @'+ethers.utils.parseBytes32String(HANDLE)+PADDING,
      '0x',
    )
      .returns();

      let tx = await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PROJECT_ID,
                AMOUNT_DISTRIBUTED,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
        .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
        .withArgs(
          /*_fundingCycle.configuration*/timestamp,
          /*_fundingCycle.number*/1,
          PROJECT_ID,
          [
            split.preferClaimed,
            split.percent,
            split.lockedUntil,
            split.beneficiary,
            split.allocator,
            split.projectId,
          ],
          /*payoutAmount*/ Math.floor(AMOUNT_MINUS_FEES * split.percent / SPLITS_TOTAL_PERCENT),
          caller.address
        )
      })
    );

    expect(await(tx))
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/timestamp,
        /*_fundingCycle.number*/1,
        /*_projectId*/PROJECT_ID,
        /*_projectOwner*/projectOwner.address,
        /*_amount*/AMOUNT_DISTRIBUTED,
        /*_distributedAmount*/AMOUNT_DISTRIBUTED,
        /*_feeAmount*/AMOUNT_DISTRIBUTED-AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/0,
        /*_memo*/MEMO,
        /*msg.sender*/caller.address
      );
  });

  it('Should distribute payout minus fee and pay the fee via the same terminal, if using Juicebox DAO terminal', async function () {
    const { projectOwner, caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbEthPaymentTerminalStore, mockJbDirectory, mockJbSplitsStore } = await setup();
    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * 200) / (DEFAULT_FEE + 200));

    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

      console.log(ethers.BigNumber.from(1).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
      )

    await mockJbEthPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        projectOwner.address,
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        PROJECT_ID,
        //preferedCLaimed | uint160(beneficiary)<<1 and preferedClaimed=false hard coded
        ethers.BigNumber.from(0).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
        /*_minReturnedTokens*/0, //hard coded
        'Fee from @'+ethers.utils.parseBytes32String(HANDLE)+PADDING,
        /*DELEGATE_METADATA*/'0x'
      )
      .returns(
        fundingCycle,
        0,
        0,
        'Fee from @'+ethers.utils.parseBytes32String(HANDLE)+PADDING,
      )

    let tx = await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PROJECT_ID,
                AMOUNT_DISTRIBUTED,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
        .to.emit(jbEthPaymentTerminal, 'DistributeToPayoutSplit')
        .withArgs(
          /*_fundingCycle.configuration*/timestamp,
          /*_fundingCycle.number*/1,
          PROJECT_ID,
          [
            split.preferClaimed,
            split.percent,
            split.lockedUntil,
            split.beneficiary,
            split.allocator,
            split.projectId,
          ],
          /*payoutAmount*/ Math.floor(AMOUNT_MINUS_FEES * split.percent / SPLITS_TOTAL_PERCENT),
          caller.address
        )
      })
    );

    expect(await(tx))
      .to.emit(jbEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/timestamp,
        /*_fundingCycle.number*/1,
        /*_projectId*/PROJECT_ID,
        /*_projectOwner*/projectOwner.address,
        /*_amount*/AMOUNT_DISTRIBUTED,
        /*_distributedAmount*/AMOUNT_DISTRIBUTED,
        /*_feeAmount*/AMOUNT_DISTRIBUTED-AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/0,
        /*_memo*/MEMO,
        /*msg.sender*/caller.address
      );
  });



// fee (glob var) = 0 || project id = 1 ?
//   true -> no fee taken                                        [X]
//   false -> takeFee() :
//     _fundingCycle.shouldHoldfee ?
//       false -> push in heldFeesOf                             [X]
//       true -> _takeFee                                
//          primary terminal of the token = this?
//              true -> _pay (event)                             [ ]
//              false -> terminal.pay                            [X]
// leftOver = distributetToPayoutSplitsOf()
//    iterate over splits
//        allocator ? 
//           true -> allocate()                                  [ ]
//           false -> project specified ?
//                        true -> primTerminal of project id ?
//                                    == 0 -> revert             [ ]
//                                    == this -> _pay (event)    [ ]
//                                    else terminal.pay          [ ]
//                         false -> send to beneficiary          [ ]
//        leftOver -= amount send
//    emit event                                                 [(X)]->for each
// leftOver > 0 -> true: send to projectOwner                    [ ]
// emit event                                                    [(X)]->for each

});
