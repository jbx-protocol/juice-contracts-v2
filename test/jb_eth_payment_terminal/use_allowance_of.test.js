import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';

describe('JBETHPaymentTerminal::useAllowanceOf(...)', function () {
  const AMOUNT = 50000;
  const DEFAULT_FEE = 10; // 5%
  const AMOUNT_MINUS_FEES = Math.floor((AMOUNT * 200) / (DEFAULT_FEE + 200));

  const FUNDING_CYCLE_NUM = 1;
  const HANDLE = ethers.utils.formatBytes32String('PROJECT_HANDLE');
  const JUICEBOX_PROJECT_ID = 1;
  const MEMO = 'test memo';
  const PADDING = '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00';
  const PROJECT_ID = 13;
  const WEIGHT = 1000;

  async function setup() {
    const [deployer, beneficiary, otherCaller, projectOwner, terminalOwner] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    const [
      mockJbDirectory,
      mockJbEthPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbEthPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });
    await mockJbEthPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    const jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbEthPaymentTerminalStore.address,
        terminalOwner.address,
      );

    /* Lib constants */

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();
    const USE_ALLOWANCE_PERMISSION_INDEX = await jbOperations.USE_ALLOWANCE();

    let jbTokenFactory = await ethers.getContractFactory('JBTokens');
    let jbToken = await jbTokenFactory.deploy();
    const ETH_ADDRESS = await jbToken.ETH();

    /* Common mocks */

    await mockJbProjects.mock.ownerOf.returns(projectOwner.address);
    await mockJbProjects.mock.handleOf.returns(HANDLE);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        USE_ALLOWANCE_PERMISSION_INDEX,
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
      jbEthPaymentTerminal,
      fundingCycle,
      mockJbDirectory,
      mockJbEthPaymentTerminalStore,
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
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJbEthPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    // Give terminal sufficient ETH
    await ethers.provider.send('hardhat_setBalance', [
      jbEthPaymentTerminal.address,
      '0x' + AMOUNT.toString(16),
    ]);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to zero
    await jbEthPaymentTerminal.connect(terminalOwner).setFee(0);

    const tx = await jbEthPaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'UseAllowance')
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
    expect(await ethers.provider.getBalance(jbEthPaymentTerminal.address)).to.equal(0);

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
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJbEthPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(JUICEBOX_PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    // Give terminal sufficient ETH
    await ethers.provider.send('hardhat_setBalance', [
      jbEthPaymentTerminal.address,
      '0x' + AMOUNT.toString(16),
    ]);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to default 5% - won't be applied though
    await jbEthPaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    const tx = await jbEthPaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        JUICEBOX_PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'UseAllowance')
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
    expect(await ethers.provider.getBalance(jbEthPaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT),
    );
  });

  it('Should send funds from overflow, with fees held, and emit event', async function () {
    const {
      beneficiary,
      CURRENCY_ETH,
      ETH_ADDRESS,
      fundingCycle,
      jbEthPaymentTerminal,
      mockJbDirectory,
      mockJbEthPaymentTerminalStore,
      projectOwner,
      terminalOwner,
      timestamp,
    } = await setup();

    await mockJbEthPaymentTerminalStore.mock.recordUsedAllowanceOf
      .withArgs(PROJECT_ID, /* amount */ AMOUNT, CURRENCY_ETH, /* minReturnedWei */ AMOUNT)
      .returns(fundingCycle, AMOUNT);

    await mockJbEthPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        projectOwner.address,
        AMOUNT - AMOUNT_MINUS_FEES,
        JUICEBOX_PROJECT_ID,
        ethers.BigNumber.from(0).or(ethers.BigNumber.from(projectOwner.address).shl(1)),
        /* minReturnedTokens */ 0,
        /* memo */ 'Fee from @' + ethers.utils.parseBytes32String(HANDLE) + PADDING,
        /* delegateMetadata */ '0x',
      )
      .returns(fundingCycle, WEIGHT, AMOUNT, MEMO);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(jbEthPaymentTerminal.address);

    // Give terminal sufficient ETH
    await ethers.provider.send('hardhat_setBalance', [
      jbEthPaymentTerminal.address,
      '0x' + AMOUNT_MINUS_FEES.toString(16),
    ]);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    // Set fee to default 5%
    await jbEthPaymentTerminal.connect(terminalOwner).setFee(DEFAULT_FEE);

    const tx = await jbEthPaymentTerminal
      .connect(projectOwner)
      .useAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
      );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'UseAllowance')
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
    expect(await ethers.provider.getBalance(jbEthPaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT_MINUS_FEES),
    );
  });

  it(`Can't send funds from overflow without project access`, async function () {
    const { beneficiary, CURRENCY_ETH, jbEthPaymentTerminal, mockJbOperatorStore, otherCaller } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);

    await expect(
      jbEthPaymentTerminal
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
