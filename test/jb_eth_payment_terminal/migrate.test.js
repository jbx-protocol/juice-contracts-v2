import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { setBalance } from '../helpers/utils';
import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JbEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';

describe('JBETHPaymentTerminal::migrate(...)', function () {
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
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JbEthPaymentTerminal.abi),
      deployMockContract(deployer, JBPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    const jbTokensFactory = await ethers.getContractFactory('JBTokens');
    const jbTokens = await jbTokensFactory.deploy();
    const TOKEN_ETH = await jbTokens.ETH();

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

    await mockJBPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

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

    // addToBalanceOf _amount is 0 if ETH terminal
    await mockJbEthPaymentTerminal.mock.addToBalanceOf.withArgs(/*CURRENT_TERMINAL_BALANCE*/0, PROJECT_ID, '').returns();

    await setBalance(jbEthPaymentTerminal.address, CURRENT_TERMINAL_BALANCE);

    await mockJBPaymentTerminalStore.mock.recordMigration
      .withArgs(PROJECT_ID)
      .returns(CURRENT_TERMINAL_BALANCE);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      addrs,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
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

  it('Should migrate terminal with empty balance and emit event if caller is project owner', async function () {
    const {
      projectOwner,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJBPaymentTerminalStore,
    } = await setup();

    await mockJBPaymentTerminalStore.mock.recordMigration.withArgs(PROJECT_ID).returns(0);

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
