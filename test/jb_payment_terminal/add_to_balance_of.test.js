import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../helpers/utils.js';

import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JBEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import jbPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbPrices from '../../artifacts/contracts/JBPrices.sol/JBPrices.json';

describe('JBPayoutRedemptionPaymentTerminal::addToBalanceOf(...)', function () {
  const PROTOCOL_PROJECT_ID = 1;
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const MIN_TOKEN_REQUESTED = 0;
  const MEMO = 'Memo Test';
  const ETH_ADDRESS = '0x000000000000000000000000000000000000EEEe';

  let CURRENCY_ETH;
  let ETH_PAYOUT_INDEX;

  before(async function () {
    let jbSplitsGroupsFactory = await ethers.getContractFactory('JBSplitsGroups');
    let jbSplitsGroups = await jbSplitsGroupsFactory.deploy();

    ETH_PAYOUT_INDEX = await jbSplitsGroups.ETH_PAYOUT();

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    CURRENCY_ETH = await jbCurrencies.ETH();
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    const SPLITS_GROUP = 1;

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
      mockJbToken,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JBEthPaymentTerminal.abi),
      deployMockContract(deployer, jbPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbPrices.abi),
      deployMockContract(deployer, jbToken.abi),
    ]);

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    let jbErc20TerminalFactory = await ethers.getContractFactory(
      'JBERC20PaymentTerminal',
      deployer,
    );
    const NON_ETH_TOKEN = mockJbToken.address;

    let jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        /*base weight currency*/ CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJBPaymentTerminalStore.address,
        terminalOwner.address,
      );

    const DECIMALS = 1;

    await mockJbToken.mock.decimals.returns(DECIMALS);

    let JBERC20PaymentTerminal = await jbErc20TerminalFactory
      .connect(deployer)
      .deploy(
        NON_ETH_TOKEN,
        CURRENCY_ETH,
        CURRENCY_ETH,
        SPLITS_GROUP,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJBPaymentTerminalStore.address,
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
      .withArgs(PROJECT_ID, jbEthPaymentTerminal.address)
      .returns(true);

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, JBERC20PaymentTerminal.address)
      .returns(true);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROTOCOL_PROJECT_ID, ETH_ADDRESS)
      .returns(jbEthPaymentTerminal.address)

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROTOCOL_PROJECT_ID, NON_ETH_TOKEN)
      .returns(JBERC20PaymentTerminal.address)

    await mockJBPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT, CURRENCY_ETH, CURRENCY_ETH)
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

    await mockJBPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns();

    await setBalance(jbEthPaymentTerminal.address, AMOUNT);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      addrs,
      jbEthPaymentTerminal,
      JBERC20PaymentTerminal,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbToken,
      mockJbOperatorStore,
      mockJbSplitsStore,
      timestamp,
      fundingCycle,
    };
  }

  it('Should add to the project balance, refund any held fee by removing them if the transferred amount is enough, and emit event', async function () {
    const {
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

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT, ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    expect(
      await jbEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, AMOUNT, MEMO, { value: AMOUNT }),
    )
      .to.emit(jbEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, AMOUNT, MEMO, caller.address);

    expect(await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([]);
  });
  it('Should work with eth terminal with non msg.value amount sent', async function () {
    const { caller, jbEthPaymentTerminal, mockJBPaymentTerminalStore, fundingCycle } =
      await setup();
    await mockJBPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns();

    await jbEthPaymentTerminal
      .connect(caller)
      .addToBalanceOf(PROJECT_ID, AMOUNT + 1, MEMO, { value: AMOUNT });
  });
  it('Should work with non-eth terminal if no value is sent', async function () {
    const {
      caller,
      JBERC20PaymentTerminal,
      mockJbToken,
      mockJBPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    await mockJBPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns();

    await mockJbToken.mock.transferFrom
      .withArgs(caller.address, JBERC20PaymentTerminal.address, AMOUNT)
      .returns(0);
    await JBERC20PaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, AMOUNT, MEMO, {
      value: 0,
    });
  });
  it('Should add to the project balance, refund a held fee by substracting the amount from the held fee amount and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockJBPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT, ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await mockJBPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 1)
      .returns();

    let heldFeeBefore = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await jbEthPaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, 1, MEMO, { value: 1 }),
    )
      .to.emit(jbEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, 1, MEMO, caller.address);

    let heldFeeAfter = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(1));
  });
  it('Should add to the project balance, refund multiple held fee by substracting the amount from the held fee amount when possible, and held the fee left when not', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockJBPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJBPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT.div(2), CURRENCY_ETH, CURRENCY_ETH)
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

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT.div(2), ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT.div(2), ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await mockJBPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 10)
      .returns();

    let heldFeeBefore = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await jbEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, 10, MEMO, { value: 10 }),
    )
      .to.emit(jbEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, 10, MEMO, caller.address);

    let heldFeeAfter = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(10));
  });
  it("Can't add with value if terminal token isn't ETH", async function () {
    const { caller, JBERC20PaymentTerminal } = await setup();

    await expect(
      JBERC20PaymentTerminal.connect(caller).addToBalanceOf(PROJECT_ID, AMOUNT, MEMO, {
        value: 10,
      }),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
  it("Can't add to balance if terminal doesn't belong to project", async function () {
    const { caller, jbEthPaymentTerminal, mockJbDirectory } = await setup();

    const otherProjectId = 18;
    await mockJbDirectory.mock.isTerminalOf
      .withArgs(otherProjectId, jbEthPaymentTerminal.address)
      .returns(false);

    await expect(
      jbEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(otherProjectId, AMOUNT, MEMO, { value: 0 }),
    ).to.be.revertedWith(errors.PROJECT_TERMINAL_MISMATCH);
  });
});
