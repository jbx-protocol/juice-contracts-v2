import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbController from '../../artifacts/contracts/JBController.sol/JBController.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jb18DecimalPaymentTerminalStore from '../../artifacts/contracts/JB18DecimalPaymentTerminalStore.sol/JB18DecimalPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';

describe('JB18DecimalPaymentTerminal::remainingDistributionLimitOf(...)', function () {
  const PROJECT_ID = 13;
  const FUNDING_CYCLE_NUMBER = 1;
  const BALANCE = 100;

  async function setup() {
    let [deployer, terminalOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbController,
      mockJbDirectory,
      mockJB18DecimalPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbController.abi),
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jb18DecimalPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);

    let jbEthPaymentTerminal = await jbTerminalFactory
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

    return {
      terminalOwner,
      addrs,
      jbEthPaymentTerminal,
      mockJbDirectory,
      mockJB18DecimalPaymentTerminalStore,
      mockJbController,
      timestamp,
    };
  }

  it('Should return the remaining distribution limit of the project', async function () {
    const {
      jbEthPaymentTerminal,
      mockJbDirectory,
      mockJbController,
      mockJB18DecimalPaymentTerminalStore,
      timestamp,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, jbEthPaymentTerminal.address)
      .returns(BALANCE);

    await mockJB18DecimalPaymentTerminalStore.mock.usedDistributionLimitOf
      .withArgs(jbEthPaymentTerminal.address, PROJECT_ID, FUNDING_CYCLE_NUMBER)
      .returns(BALANCE);

    expect(
      await jbEthPaymentTerminal.remainingDistributionLimitOf(
        PROJECT_ID,
        timestamp,
        FUNDING_CYCLE_NUMBER,
      ),
    ).to.equal(0);
  });
});
