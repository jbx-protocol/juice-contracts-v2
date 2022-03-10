import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../helpers/utils.js';

import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JbEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import jbPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JBETHPaymentTerminal::addToBalanceOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const MIN_TOKEN_REQUESTED = 0;
  const MEMO = 'Memo Test';

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
      mockJbPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JbEthPaymentTerminal.abi),
      deployMockContract(deployer, jbPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    let jbErc20TerminalFactory = await ethers.getContractFactory('JBERC20PaymentTerminal', deployer);
    const mockJbToken = await deployMockContract(deployer, jbToken.abi);
    const NON_ETH_TOKEN = mockJbToken.address;

    let currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

    await mockJbPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    let jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        /*base weight currency*/CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPaymentTerminalStore.address,
        terminalOwner.address,
      );

    currentNonce = await ethers.provider.getTransactionCount(deployer.address);

    const futureOtherCurrencyTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

    await mockJbPaymentTerminalStore.mock.claimFor.withArgs(futureOtherCurrencyTerminalAddress).returns();

    let jbErc20PaymentTerminal = await jbErc20TerminalFactory
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
      .withArgs(PROJECT_ID, jbEthPaymentTerminal.address)
      .returns(true);

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, jbErc20PaymentTerminal.address)
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
      jbErc20PaymentTerminal,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbPaymentTerminalStore,
      mockJbToken,
      mockJbOperatorStore,
      mockJbSplitsStore,
      timestamp,
      fundingCycle,
    };
  }

  it('Should add to the project balance, refund any held fee by removing them if the transfered amount is enough, and emit event', async function () {
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
        .addToBalanceOf(AMOUNT, PROJECT_ID, MEMO, { value: AMOUNT }),
    )
      .to.emit(jbEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, AMOUNT, MEMO, caller.address);

    expect(await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([]);
  });
  it('Should work with eth terminal with non msg.value amount sent', async function () {
    const {
      caller,
      jbEthPaymentTerminal,
      mockJbPaymentTerminalStore,
      fundingCycle
    } = await setup();
    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns(fundingCycle);

    await jbEthPaymentTerminal
      .connect(caller)
      .addToBalanceOf(AMOUNT + 1, PROJECT_ID, MEMO, { value: AMOUNT });
  });
  it('Should work with non-eth terminal if no value is sent', async function () {
    const {
      caller,
      jbErc20PaymentTerminal,
      mockJbToken,
      mockJbPaymentTerminalStore,
      fundingCycle
    } = await setup();
    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns(fundingCycle);

    await mockJbToken.mock.transferFrom.withArgs(caller.address, jbErc20PaymentTerminal.address, AMOUNT).returns(0);
    await jbErc20PaymentTerminal
      .connect(caller)
      .addToBalanceOf(AMOUNT, PROJECT_ID, MEMO, { value: 0 });
  });

  it('Should add to the project balance, refund a held fee by substracting the amount from the held fee amount and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      jbEthPaymentTerminal,
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

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT, ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 1)
      .returns(fundingCycle);

    let heldFeeBefore = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await jbEthPaymentTerminal.connect(caller).addToBalanceOf(1, PROJECT_ID, MEMO, { value: 1 }),
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

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT.div(2), ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await jbEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(PROJECT_ID, AMOUNT.div(2), ETH_PAYOUT_INDEX, MIN_TOKEN_REQUESTED, MEMO);

    await mockJbPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 10)
      .returns(fundingCycle);

    let heldFeeBefore = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await jbEthPaymentTerminal.connect(caller).addToBalanceOf(10, PROJECT_ID, MEMO, { value: 10 }),
    )
      .to.emit(jbEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, 10, MEMO, caller.address);

    let heldFeeAfter = await jbEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(10));
  });
  it("Can't add with value if terminal token isn't ETH", async function () {
    const { caller, jbErc20PaymentTerminal } = await setup();

    await expect(
      jbErc20PaymentTerminal
        .connect(caller)
        .addToBalanceOf(AMOUNT, PROJECT_ID, MEMO,
          { value: 10 },
        ),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
  it("Can't add to balance if terminal doesn't belong to project", async function () {
    const { caller, jbEthPaymentTerminal, mockJbDirectory } = await setup();

    const otherProjectId = 18;
    await mockJbDirectory.mock.isTerminalOf
      .withArgs(otherProjectId, jbEthPaymentTerminal.address)
      .returns(false);

    await expect(
      jbEthPaymentTerminal.connect(caller).addToBalanceOf(AMOUNT, otherProjectId, MEMO, { value: 0 }),
    ).to.be.revertedWith(errors.PROJECT_TERMINAL_MISMATCH);
  });
});
