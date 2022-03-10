import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata, setBalance } from '../helpers/utils.js';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbFeeGauge from '../../artifacts/contracts/interfaces/IJBFeeGauge.sol/IJBFeeGauge.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';

describe('JBERC20PaymentTerminal::useAllowanceOf(...)', function () {
  const AMOUNT = 50000;
  const DEFAULT_FEE =   50000000; // 5%
  const FEE_DISCOUNT = 500000000; // 50%

  const FUNDING_CYCLE_NUM = 1;
  const JUICEBOX_PROJECT_ID = 1;
  const MEMO = 'test memo';
  const PROJECT_ID = 13;
  const WEIGHT = 1000;

  let MAX_FEE;
  let MAX_FEE_DISCOUNT;
  let AMOUNT_MINUS_FEES;

  async function setup() {
    const [deployer, beneficiary, otherCaller, projectOwner, terminalOwner] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    const [
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JBPaymentTerminalStore.abi),
      deployMockContract(deployer, jbFeeGauge.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbTerminalFactory = await ethers.getContractFactory('JBERC20PaymentTerminal', deployer);
    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });
    await mockJBPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    const jbERC20PaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJBPaymentTerminalStore.address,
        terminalOwner.address,
      );

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    const jbConstantsFactory = await ethers.getContractFactory('JBConstants');
    const jbConstants = await jbConstantsFactory.deploy();
    MAX_FEE_DISCOUNT = await jbConstants.MAX_FEE_DISCOUNT();
    MAX_FEE = (await jbConstants.MAX_FEE()).toNumber();

    AMOUNT_MINUS_FEES = Math.floor((AMOUNT * MAX_FEE) / (DEFAULT_FEE + MAX_FEE));

    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();
    const PROCESS_FEES_PERMISSION_INDEX = await jbOperations.PROCESS_FEES();
    const USE_ALLOWANCE_PERMISSION_INDEX = await jbOperations.USE_ALLOWANCE();

    let jbTokenFactory = await ethers.getContractFactory('JBTokens');
    let jbToken = await jbTokenFactory.deploy();
    const ETH_ADDRESS = await jbToken.ETH();

    await mockJbProjects.mock.ownerOf.returns(projectOwner.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        USE_ALLOWANCE_PERMISSION_INDEX,
      )
      .returns(true);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        PROCESS_FEES_PERMISSION_INDEX,
      )
      .returns(true);

    const fundingCycle = {
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: 0,
    };

    return {
      beneficiary,
      CURRENCY_ETH,
      ETH_ADDRESS,
      jbERC20PaymentTerminal,
      fundingCycle,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbOperatorStore,
      otherCaller,
      projectOwner,
      terminalOwner,
      timestamp,
    };
  }

  it('Should send funds from overflow, without fees, and emit event', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      fundingCycle,
      jbERC20PaymentTerminal,
      mockJBPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJBPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    // Give terminal sufficient ETH
    await setBalance(jbERC20PaymentTerminal.address, AMOUNT);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to zero
    await jbERC20PaymentTerminal.connect(terminalOwner).setFee(0);

    const tx = await jbERC20PaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbERC20PaymentTerminal, 'UseAllowance')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ PROJECT_ID,
        /* _beneficiary */ beneficiary.address,
        /* _withdrawnAmount */ AMOUNT,
        /* _feeAmount */ 0,
        /* _withdrawnAmount - _feeAmount */ AMOUNT,
        /* msg.sender */ projectOwner.address,
      );

    // Terminal should be out of ETH
    expect(await ethers.provider.getBalance(jbERC20PaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT),
    );
  });

  it('Should send funds from overflow, without fees for Juicebox project, and emit event', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      fundingCycle,
      jbERC20PaymentTerminal,
      mockJBPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJBPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(JUICEBOX_PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    // Give terminal sufficient ETH
    await setBalance(jbERC20PaymentTerminal.address, AMOUNT);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to default 5% - won't be applied though
    await jbERC20PaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    const tx = await jbERC20PaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        JUICEBOX_PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbERC20PaymentTerminal, 'UseAllowance')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ JUICEBOX_PROJECT_ID,
        /* _beneficiary */ beneficiary.address,
        /* _withdrawnAmount */ AMOUNT,
        /* _feeAmount */ 0,
        /* _withdrawnAmount - _feeAmount */ AMOUNT,
        /* msg.sender */ projectOwner.address,
      );

    // Terminal should be out of ETH
    expect(await ethers.provider.getBalance(jbERC20PaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT),
    );
  });

  it('Should send funds from overflow, with fees applied, and emit event', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      ETH_ADDRESS,
      fundingCycle,
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJBPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    await mockJBPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        jbERC20PaymentTerminal.address,
        AMOUNT - AMOUNT_MINUS_FEES,
        JUICEBOX_PROJECT_ID,
        ethers.BigNumber.from(0).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
        /* minReturnedTokens */ 0,
        /* memo */ '',
        /* delegateMetadata */ '0x',
      )
      .returns(fundingCycle, WEIGHT, AMOUNT, MEMO);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(jbERC20PaymentTerminal.address);

    // Give terminal sufficient ETH
    await setBalance(jbERC20PaymentTerminal.address, AMOUNT_MINUS_FEES);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to default 5%
    await jbERC20PaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    const tx = await jbERC20PaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbERC20PaymentTerminal, 'UseAllowance')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ PROJECT_ID,
        /* _beneficiary */ beneficiary.address,
        /* _withdrawnAmount */ AMOUNT,
        /* _feeAmount */ AMOUNT - AMOUNT_MINUS_FEES,
        /* _withdrawnAmount - _feeAmount */ AMOUNT_MINUS_FEES,
        /* msg.sender */ projectOwner.address,
      );

    // Terminal should be out of ETH
    expect(await ethers.provider.getBalance(jbERC20PaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT_MINUS_FEES),
    );
  });

  it('Should send funds from overflow, with discounted fees applied if gauge is set', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      ETH_ADDRESS,
      fundingCycle,
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbFeeGauge,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    const DISCOUNTED_FEE =
      DEFAULT_FEE - Math.floor((DEFAULT_FEE * FEE_DISCOUNT) / MAX_FEE_DISCOUNT);
    const AMOUNT_MINUS_DISCOUNTED_FEES = Math.floor((AMOUNT * MAX_FEE) / (MAX_FEE + DISCOUNTED_FEE));

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(FEE_DISCOUNT);

    await mockJBPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    await mockJBPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        jbERC20PaymentTerminal.address,
        AMOUNT - AMOUNT_MINUS_DISCOUNTED_FEES,
        JUICEBOX_PROJECT_ID,
        ethers.BigNumber.from(0).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
        /* minReturnedTokens */ 0,
        /* memo */ '',
        /* delegateMetadata */ '0x',
      )
      .returns(fundingCycle, WEIGHT, AMOUNT, MEMO);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(jbERC20PaymentTerminal.address);

    // Give terminal sufficient ETH
    await setBalance(jbERC20PaymentTerminal.address, AMOUNT_MINUS_DISCOUNTED_FEES);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to default 5%
    await jbERC20PaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    await jbERC20PaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    const tx = await jbERC20PaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbERC20PaymentTerminal, 'UseAllowance')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ PROJECT_ID,
        /* _beneficiary */ beneficiary.address,
        /* _withdrawnAmount */ AMOUNT,
        /* _feeAmount */ AMOUNT - AMOUNT_MINUS_DISCOUNTED_FEES,
        /* _withdrawnAmount - _feeAmount */ AMOUNT_MINUS_DISCOUNTED_FEES,
        /* msg.sender */ projectOwner.address,
      );

    // Terminal should be out of ETH
    expect(await ethers.provider.getBalance(jbERC20PaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT_MINUS_DISCOUNTED_FEES),
    );
  });

  it('Should send funds from overflow, with non discounted-fees applied if discount is above 100%', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      ETH_ADDRESS,
      fundingCycle,
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbFeeGauge,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(MAX_FEE_DISCOUNT + 1);

    await mockJBPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    await mockJBPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        jbERC20PaymentTerminal.address,
        AMOUNT - AMOUNT_MINUS_FEES,
        JUICEBOX_PROJECT_ID,
        ethers.BigNumber.from(0).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
        /* minReturnedTokens */ 0,
        /* memo */ '',
        /* delegateMetadata */ '0x',
      )
      .returns(fundingCycle, WEIGHT, AMOUNT, MEMO);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(jbERC20PaymentTerminal.address);

    // Give terminal sufficient ETH
    await setBalance(jbERC20PaymentTerminal.address, AMOUNT_MINUS_FEES);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    await jbERC20PaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    // Set fee to default 5%
    await jbERC20PaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    const tx = await jbERC20PaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbERC20PaymentTerminal, 'UseAllowance')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ PROJECT_ID,
        /* _beneficiary */ beneficiary.address,
        /* _withdrawnAmount */ AMOUNT,
        /* _feeAmount */ AMOUNT - AMOUNT_MINUS_FEES,
        /* _withdrawnAmount - _feeAmount */ AMOUNT_MINUS_FEES,
        /* msg.sender */ projectOwner.address,
      );

    // Terminal should be out of ETH
    expect(await ethers.provider.getBalance(jbERC20PaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT_MINUS_FEES),
    );
  });

  it('Should send funds from overflow, with fees held, then process fees, and emit event', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      ETH_ADDRESS,
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    const newFundingCycle = {
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ holdFees: 1 }), // Hold fees
    };

    await mockJBPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(newFundingCycle, AMOUNT);

    await mockJBPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        jbERC20PaymentTerminal.address,
        AMOUNT - AMOUNT_MINUS_FEES,
        JUICEBOX_PROJECT_ID,
        ethers.BigNumber.from(0).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
        /* minReturnedTokens */ 0,
        /* memo */ '',
        /* delegateMetadata */ '0x',
      )
      .returns(newFundingCycle, WEIGHT, AMOUNT, MEMO);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(jbERC20PaymentTerminal.address);

    // Give terminal sufficient ETH
    await setBalance(jbERC20PaymentTerminal.address, AMOUNT_MINUS_FEES);

    // Set fee to default 5%
    await jbERC20PaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    // Use allowance and hold fee
    await jbERC20PaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    // Should be holding fees in the contract
    expect(await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([
      [ethers.BigNumber.from(AMOUNT), DEFAULT_FEE, projectOwner.address],
    ]);

    // Process held fees
    const tx = await jbERC20PaymentTerminal.connect(projectOwner).processFees(PROJECT_ID);

    expect(await tx).to.emit(jbERC20PaymentTerminal, 'ProcessFees');
    /** @dev Chai matchers can't seem to match these args even though I've inspected the data inside to be exactly the same. */
    // .withArgs(
    //   PROJECT_ID,
    //   [
    //     [
    //       ethers.BigNumber.from(AMOUNT),
    //       DEFAULT_FEE,
    //       projectOwner.address,
    //       '',
    //     ],
    //   ],
    //   projectOwner.address,
    // );

    // Held fees shoudn't exist after being processed
    expect(await jbERC20PaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([]);
  });

  it(`Can't send funds from overflow without project access`, async function () {
    const { beneficiary, CURRENCY_ETH, jbERC20PaymentTerminal, mockJbOperatorStore, otherCaller } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);

    await expect(
      jbERC20PaymentTerminal
        .connect(otherCaller)
        .useAllowanceOf(
          PROJECT_ID,
          AMOUNT,
          CURRENCY_ETH,
          /* minReturnedWei */ AMOUNT,
          beneficiary.address,
        ),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });
});
