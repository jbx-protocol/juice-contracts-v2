import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { setBalance } from '../helpers/utils';
import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JbERC20PaymentTerminal from '../../artifacts/contracts/JBERC20PaymentTerminal.sol/JBERC20PaymentTerminal.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JBERC20PaymentTerminal::migrate(...)', function () {
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
      mockJbERC20PaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockToken
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JbERC20PaymentTerminal.abi),
      deployMockContract(deployer, JBPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi),
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    let jbTerminalFactory = await ethers.getContractFactory('JBERC20PaymentTerminal', deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

    await mockJBPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    let jbERC20PaymentTerminal = await jbTerminalFactory
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

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        MIGRATE_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbERC20PaymentTerminal.mock.token.returns(CURRENCY_ETH);

    await mockJbERC20PaymentTerminal.mock.addToBalanceOf.withArgs(CURRENT_TERMINAL_BALANCE, PROJECT_ID, '').returns();

    await setBalance(jbERC20PaymentTerminal.address, CURRENT_TERMINAL_BALANCE);

    await mockJBPaymentTerminalStore.mock.recordMigration
      .withArgs(PROJECT_ID)
      .returns(CURRENT_TERMINAL_BALANCE);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      addrs,
      jbERC20PaymentTerminal,
      mockJbERC20PaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
    };
  }

  it('Should migrate terminal and emit event if caller is project owner', async function () {
    const { projectOwner, jbERC20PaymentTerminal, mockJbERC20PaymentTerminal } = await setup();

    expect(
      await jbERC20PaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbERC20PaymentTerminal.address),
    )
      .to.emit(jbERC20PaymentTerminal, 'Migrate')
      .withArgs(
        PROJECT_ID,
        mockJbERC20PaymentTerminal.address,
        CURRENT_TERMINAL_BALANCE,
        projectOwner.address,
      );
  });

  it('Should migrate terminal with empty balance and emit event if caller is project owner', async function () {
    const {
      projectOwner,
      jbERC20PaymentTerminal,
      mockJbERC20PaymentTerminal,
      mockJBPaymentTerminalStore,
    } = await setup();

    await mockJBPaymentTerminalStore.mock.recordMigration.withArgs(PROJECT_ID).returns(0);

    expect(
      await jbERC20PaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbERC20PaymentTerminal.address),
    )
      .to.emit(jbERC20PaymentTerminal, 'Migrate')
      .withArgs(PROJECT_ID, mockJbERC20PaymentTerminal.address, 0, projectOwner.address);
  });

  it('Should migrate terminal and emit event if caller is authorized', async function () {
    const {
      projectOwner,
      caller,
      jbERC20PaymentTerminal,
      mockJbERC20PaymentTerminal,
      mockJbOperatorStore,
    } = await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MIGRATE_TERMINAL_PERMISSION_INDEX)
      .returns(true);

    expect(
      await jbERC20PaymentTerminal
        .connect(caller)
        .migrate(PROJECT_ID, mockJbERC20PaymentTerminal.address),
    )
      .to.emit(jbERC20PaymentTerminal, 'Migrate')
      .withArgs(
        PROJECT_ID,
        mockJbERC20PaymentTerminal.address,
        CURRENT_TERMINAL_BALANCE,
        caller.address,
      );
  });

  it("Can't migrate terminal with different token", async function () {
    const { projectOwner, jbERC20PaymentTerminal, mockJbERC20PaymentTerminal } = await setup();

    await mockJbERC20PaymentTerminal.mock.token.returns(ethers.Wallet.createRandom().address);

    await expect(
      jbERC20PaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbERC20PaymentTerminal.address),
    ).to.be.revertedWith(errors.TERMINAL_TOKENS_INCOMPATIBLE);
  });
});