import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../helpers/utils.js';

import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JbERC20PaymentTerminal from '../../artifacts/contracts/JBERC20PaymentTerminal.sol/JBERC20PaymentTerminal.json';
import jbPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';




// TODO ADD WTF_U_DOIN TEST





describe('JBERC20PaymentTerminal::addToBalanceOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const DEFAULT_FEE = 50000000; // 5%

  const MIN_TOKEN_REQUESTED = 0;
  const MEMO = 'Memo Test';

  let CURRENCY_ETH;
  let CURRENCY_USD;
  let ETH_PAYOUT_INDEX;
  let MAX_FEE;
  let AMOUNT_MINUS_FEES;

  before(async function () {
    let jbSplitsGroupsFactory = await ethers.getContractFactory('JBSplitsGroups');
    let jbSplitsGroups = await jbSplitsGroupsFactory.deploy();

    ETH_PAYOUT_INDEX = await jbSplitsGroups.ETH_PAYOUT();

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    CURRENCY_ETH = await jbCurrencies.ETH();
    CURRENCY_USD = await jbCurrencies.USD();

    let jbConstantsFactory = await ethers.getContractFactory('JBConstants');
    let jbConstants = await jbConstantsFactory.deploy();
    MAX_FEE = (await jbConstants.MAX_FEE()).toNumber();
    AMOUNT_MINUS_FEES = (AMOUNT.mul(MAX_FEE).div( (DEFAULT_FEE + MAX_FEE) ));
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbDirectory,
      mockJbERC20PaymentTerminal,
      mockJbPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockToken
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JbERC20PaymentTerminal.abi),
      deployMockContract(deployer, jbPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi),
    ]);

    let jbTerminalFactory = await ethers.getContractFactory('JBERC20PaymentTerminal', deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

    await mockJbPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    let jbERC20PaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        mockToken.address,
        /*currency*/ CURRENCY_USD, //terminal uses an usd values of mockToken, converted in eth to issue project token
        /*base weight currency*/ CURRENCY_ETH,
        /*payoutsplitsgroup*/ETH_PAYOUT_INDEX,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPaymentTerminalStore.address,
        terminalOwner.address,
      );

    let fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ holdFees: 1 }),
    };

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, jbERC20PaymentTerminal.address)
      .returns(true);

    await mockJbPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT, CURRENCY_ETH, 0)
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
        AMOUNT,
      );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns(fundingCycle);

    await setBalance(jbERC20PaymentTerminal.address, AMOUNT);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      addrs,
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJbERC20PaymentTerminal,
      mockJbPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbSplitsStore,
      mockToken,
      timestamp,
      fundingCycle,
    };
  }

  it('Should add to the project balance, refund any held fee by removing them if the transfered amount is enough, and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbERC20PaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockToken
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    // Split distribution
    await Promise.all(
      splits.map(async (split) => {
        console.log('term ', jbERC20PaymentTerminal.address);
        console.log('spl benef', split.beneficiary);
        console.log('net amt ',AMOUNT_MINUS_FEES.div(2).toString());
        console.log('token :', mockToken.address);
        await mockToken.mock.transferFrom.withArgs(jbERC20PaymentTerminal.address, split.beneficiary, AMOUNT_MINUS_FEES.div(2));
      }
    ))
    
    await jbERC20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT, ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    // Initial fund sends
    await mockToken.mock.transferFrom.withArgs(caller.address, jbERC20PaymentTerminal.address, AMOUNT);

    await Promise.all(
      splits.map(async (split) => {
        console.log(split.beneficiary);
        console.log(jbERC20PaymentTerminal.address);
        console.log(AMOUNT_MINUS_FEES.div(2).toString());
        await mockToken.mock.transferFrom.withArgs(split.beneficiary, jbERC20PaymentTerminal.address, AMOUNT_MINUS_FEES.div(2));
      }
    ))

    expect(
      await jbERC20PaymentTerminal
        .connect(caller)
        .addToBalanceOf(AMOUNT, PROJECT_ID, MEMO),
    )
      .to.emit(jbERC20PaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, AMOUNT, MEMO, caller.address);

    expect(await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([]);
  });

  it('Should add to the project balance, refund a held fee by substracting the amount from the held fee amount and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbERC20PaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockJbPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await jbERC20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT, ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 1)
      .returns(fundingCycle);

    let heldFeeBefore = await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await jbERC20PaymentTerminal.connect(caller).addToBalanceOf(1, PROJECT_ID, MEMO, { value: 1 }),
    )
      .to.emit(jbERC20PaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, 1, MEMO, caller.address);

    let heldFeeAfter = await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(1));
  });

  it('Should add to the project balance, refund multiple held fee by substracting the amount from the held fee amount when possible, and held the fee left when not', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbERC20PaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockJbPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT.div(2), CURRENCY_ETH, 0)
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
        AMOUNT.div(2),
      );

    await jbERC20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT.div(2), ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await jbERC20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT.div(2), ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 10)
      .returns(fundingCycle);

    let heldFeeBefore = await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await jbERC20PaymentTerminal.connect(caller).addToBalanceOf(10, PROJECT_ID, MEMO, { value: 10 }),
    )
      .to.emit(jbERC20PaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, 10, MEMO, caller.address);

    let heldFeeAfter = await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(10));
  });

  it("Can't add to balance if terminal doesn't belong to project", async function () {
    const { caller, jbERC20PaymentTerminal, mockJbDirectory } = await setup();

    const otherProjectId = 18;
    await mockJbDirectory.mock.isTerminalOf
      .withArgs(otherProjectId, jbERC20PaymentTerminal.address)
      .returns(false);

    await expect(
      jbERC20PaymentTerminal.connect(caller).addToBalanceOf(AMOUNT, otherProjectId, MEMO, { value: 0 }),
    ).to.be.revertedWith(errors.PROJECT_TERMINAL_MISMATCH);
  });
});
