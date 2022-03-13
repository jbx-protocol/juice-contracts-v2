import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { setBalance } from '../helpers/utils';
import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JBEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import jb18DecimalErc20PaymentTerminal from '../../artifacts/contracts/JB18DecimalERC20PaymentTerminal.sol/JB18DecimalERC20PaymentTerminal.json';
import jb18DecimalPaymentTerminalStore from '../../artifacts/contracts/JB18DecimalPaymentTerminalStore.sol/JB18DecimalPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JB18DecimalPaymentTerminal::migrate(...)', function () {
  const PROJECT_ID = 2;
  const CURRENT_TERMINAL_BALANCE = ethers.utils.parseEther('10');

  let MIGRATE_TERMINAL_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    MIGRATE_TERMINAL_PERMISSION_INDEX = await jbOperations.MIGRATE_TERMINAL();
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, ...addrs] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJB18DecimalERC20PaymentTerminal,
      mockJB18DecimalPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JBEthPaymentTerminal.abi),
      deployMockContract(deployer, jb18DecimalErc20PaymentTerminal.abi),
      deployMockContract(deployer, jb18DecimalPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi)
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    const jbTokensFactory = await ethers.getContractFactory('JBTokens');
    const jbTokens = await jbTokensFactory.deploy();
    const TOKEN_ETH = await jbTokens.ETH();
    const NON_ETH_TOKEN = mockJbToken.address;

    const SPLITS_GROUP = 1;

    let jbEthTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    let jbErc20TerminalFactory = await ethers.getContractFactory('JB18DecimalERC20PaymentTerminal', deployer);

    let jbEthPaymentTerminal = await jbEthTerminalFactory
      .connect(deployer)
      .deploy(
        CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJB18DecimalPaymentTerminalStore.address,
        terminalOwner.address,
      );

    const DECIMALS = 1;

    await mockJB18DecimalPaymentTerminalStore.mock.TARGET_DECIMALS.returns(DECIMALS);
    await mockJbToken.mock.decimals.returns(DECIMALS);

    let JB18DecimalERC20PaymentTerminal = await jbErc20TerminalFactory
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
        mockJB18DecimalPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        MIGRATE_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbEthPaymentTerminal.mock.token.returns(TOKEN_ETH);
    await mockJB18DecimalERC20PaymentTerminal.mock.token.returns(NON_ETH_TOKEN);

    // addToBalanceOf _amount is 0 if ETH terminal
    await mockJbEthPaymentTerminal.mock.addToBalanceOf.withArgs(CURRENT_TERMINAL_BALANCE, PROJECT_ID, '').returns();
    await mockJB18DecimalERC20PaymentTerminal.mock.addToBalanceOf.withArgs(CURRENT_TERMINAL_BALANCE, PROJECT_ID, '').returns();

    await setBalance(jbEthPaymentTerminal.address, CURRENT_TERMINAL_BALANCE);
    await setBalance(JB18DecimalERC20PaymentTerminal.address, CURRENT_TERMINAL_BALANCE);

    await mockJB18DecimalPaymentTerminalStore.mock.recordMigration
      .withArgs(PROJECT_ID)
      .returns(CURRENT_TERMINAL_BALANCE);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      addrs,
      jbEthPaymentTerminal,
      JB18DecimalERC20PaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJB18DecimalERC20PaymentTerminal,
      mockJB18DecimalPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbToken
    };
  }

  it('Should migrate terminal and emit event if caller is project owner', async function () {
    const { projectOwner, jbEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    expect(
      await jbEthPaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    )
      .to.emit(jbEthPaymentTerminal, 'Migrate')
      .withArgs(
        PROJECT_ID,
        mockJbEthPaymentTerminal.address,
        CURRENT_TERMINAL_BALANCE,
        projectOwner.address,
      );
  });

  it('Should migrate non-eth terminal', async function () {
    const { projectOwner, JB18DecimalERC20PaymentTerminal, mockJB18DecimalERC20PaymentTerminal, mockJbToken } = await setup();

    await mockJbToken.mock.approve.withArgs(mockJB18DecimalERC20PaymentTerminal.address, CURRENT_TERMINAL_BALANCE).returns(0);
    await JB18DecimalERC20PaymentTerminal
      .connect(projectOwner)
      .migrate(PROJECT_ID, mockJB18DecimalERC20PaymentTerminal.address);
  });

  it('Should migrate terminal with empty balance and emit event if caller is project owner', async function () {
    const {
      projectOwner,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJB18DecimalPaymentTerminalStore,
    } = await setup();

    await mockJB18DecimalPaymentTerminalStore.mock.recordMigration.withArgs(PROJECT_ID).returns(0);

    expect(
      await jbEthPaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    )
      .to.emit(jbEthPaymentTerminal, 'Migrate')
      .withArgs(PROJECT_ID, mockJbEthPaymentTerminal.address, 0, projectOwner.address);
  });

  it('Should migrate terminal and emit event if caller is authorized', async function () {
    const {
      projectOwner,
      caller,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJbOperatorStore,
    } = await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MIGRATE_TERMINAL_PERMISSION_INDEX)
      .returns(true);

    expect(
      await jbEthPaymentTerminal
        .connect(caller)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    )
      .to.emit(jbEthPaymentTerminal, 'Migrate')
      .withArgs(
        PROJECT_ID,
        mockJbEthPaymentTerminal.address,
        CURRENT_TERMINAL_BALANCE,
        caller.address,
      );
  });

  it("Can't migrate terminal with different token", async function () {
    const { projectOwner, jbEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    await mockJbEthPaymentTerminal.mock.token.returns(ethers.Wallet.createRandom().address);

    await expect(
      jbEthPaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    ).to.be.revertedWith(errors.TERMINAL_TOKENS_INCOMPATIBLE);
  });
});
