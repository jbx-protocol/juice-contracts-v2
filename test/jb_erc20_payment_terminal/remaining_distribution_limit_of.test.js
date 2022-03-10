import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbController from '../../artifacts/contracts/JBController.sol/JBController.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';

describe('JBERC20PaymentTerminal::remainingDistributionLimitOf(...)', function () {
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
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbController.abi),
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JBPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

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
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJBPaymentTerminalStore.address,
        terminalOwner.address,
      );

    return {
      terminalOwner,
      addrs,
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbController,
      timestamp,
    };
  }

  it('Should return the remaining distribution limit of the project', async function () {
    const {
      jbERC20PaymentTerminal,
      mockJbDirectory,
      mockJbController,
      mockJBPaymentTerminalStore,
      timestamp,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, jbERC20PaymentTerminal.address)
      .returns(BALANCE);

    await mockJBPaymentTerminalStore.mock.usedDistributionLimitOf
      .withArgs(PROJECT_ID, FUNDING_CYCLE_NUMBER)
      .returns(BALANCE);

    expect(
      await jbERC20PaymentTerminal.remainingDistributionLimitOf(
        PROJECT_ID,
        timestamp,
        FUNDING_CYCLE_NUMBER,
      ),
    ).to.equal(0);
  });
});
