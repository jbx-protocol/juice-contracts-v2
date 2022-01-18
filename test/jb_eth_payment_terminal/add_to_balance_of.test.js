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

describe('JBETHPaymentTerminal::addToBalanceOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const HANDLE = ethers.utils.formatBytes32String('PROJECT_HANDLE');
  const CURRENCY = 1;
  const MIN_TOKEN_REQUESTED = 0
  const MEMO = 'Memo Test';

  let ETH_PAYOUT_INDEX;

  before(async function () {
    let jbSplitsGroupsFactory = await ethers.getContractFactory('JBSplitsGroups')
    let jbSplitsGroups = await jbSplitsGroupsFactory.deploy();

    ETH_PAYOUT_INDEX = await jbSplitsGroups.ETH_PAYOUT();
    });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] = await ethers.getSigners();
    
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
        deployMockContract(deployer, jbDirectory.abi),
        deployMockContract(deployer, JbEthPaymentTerminal.abi),
        deployMockContract(deployer, jbEthPaymentTerminalStore.abi),
        deployMockContract(deployer, jbOperatoreStore.abi),
        deployMockContract(deployer, jbProjects.abi),
        deployMockContract(deployer, jbSplitsStore.abi),
      ]);

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


    let fundingCycle = {
        number: 1,
        configuration: timestamp,
        basedOn: timestamp,
        start: timestamp,
        duration: 0,
        weight: 0,
        discountRate: 0,
        ballot: ethers.constants.AddressZero,
        metadata: packFundingCycleMetadata( { holdFees: 1 } ),
      }

    await mockJbEthPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(
        PROJECT_ID,
        AMOUNT,
        CURRENCY,
        0
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
        AMOUNT
    )

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbProjects.mock.handleOf.withArgs(PROJECT_ID).returns(HANDLE);

    await mockJbEthPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns(fundingCycle);

    await ethers.provider.send('hardhat_setBalance', [jbEthPaymentTerminal.address, AMOUNT.toHexString()]);
      
    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne, beneficiaryTwo,
      addrs,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbSplitsStore,
      timestamp,
      fundingCycle
    }
  }

  it('Should add to the project balance, refund any held fee by removing them if the transfered amount is enough, and emit event', async function () {
      const { caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbSplitsStore } = await setup();
      const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});
  
      await mockJbSplitsStore.mock.splitsOf
        .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
        .returns(splits);
  
      await jbEthPaymentTerminal
                .connect(caller)
                .distributePayoutsOf(
                  PROJECT_ID,
                  AMOUNT,
                  ETH_PAYOUT_INDEX,
                  MIN_TOKEN_REQUESTED,
                  MEMO
                );
      
      expect(await jbEthPaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, MEMO, {value: AMOUNT}))
       .to.emit(jbEthPaymentTerminal, 'AddToBalance')
       .withArgs(
         PROJECT_ID,
         AMOUNT,
         MEMO,
         caller.address
       )
      
      expect(await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([]);
  });

  it('Should add to the project balance, refund a held fee by substracting the amount from the held fee amount and emit event', async function () {
    const { caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbSplitsStore, mockJbEthPaymentTerminalStore, fundingCycle } = await setup();
    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PROJECT_ID,
                AMOUNT,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );

              await mockJbEthPaymentTerminalStore.mock.recordAddedBalanceFor
              .withArgs(PROJECT_ID, 1)
              .returns(fundingCycle);

    let heldFeeBefore = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    
    expect(await jbEthPaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, MEMO, {value: 1}))
     .to.emit(jbEthPaymentTerminal, 'AddToBalance')
     .withArgs(
       PROJECT_ID,
       1,
       MEMO,
       caller.address
     )

    let heldFeeAfter = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(1))
  });

  it('Should add to the project balance, refund multiple held fee by substracting the amount from the held fee amount when possible, and held the fee left when not', async function () {
    const { caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbSplitsStore, mockJbEthPaymentTerminalStore, fundingCycle } = await setup();
    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbEthPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(
        PROJECT_ID,
        AMOUNT.div(2),
        CURRENCY,
        0
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
        AMOUNT.div(2)
      )

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT.div(2),
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO
      );

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT.div(2),
        ETH_PAYOUT_INDEX,
        MIN_TOKEN_REQUESTED,
        MEMO
      );

    await mockJbEthPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 10)
      .returns(fundingCycle);

    let heldFeeBefore = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    
    expect(await jbEthPaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, MEMO, {value: 10}))
    .to.emit(jbEthPaymentTerminal, 'AddToBalance')
    .withArgs(
      PROJECT_ID,
      10,
      MEMO,
      caller.address
    )

    let heldFeeAfter = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(10))
  });

  it('Can\'t add 0 ethers to the project balance', async function () {
    const { caller, beneficiaryOne, beneficiaryTwo, jbEthPaymentTerminal, timestamp, mockJbSplitsStore } = await setup();
    const splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await jbEthPaymentTerminal
              .connect(caller)
              .distributePayoutsOf(
                PROJECT_ID,
                AMOUNT,
                ETH_PAYOUT_INDEX,
                MIN_TOKEN_REQUESTED,
                MEMO
              );
    
    await expect(jbEthPaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, MEMO, {value: 0}))
     .to.be.revertedWith(errors.ZERO_VALUE_SENT);
  });

});
