import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';
import jbController from '../../artifacts/contracts/JBController.sol/JBController.json';

describe('JBETHPaymentTerminal::remainingDistributionLimitOf(...)', function () {
  const PROJECT_ID = 13;
  const FUNDING_CYCLE_NUMBER = 1;
  const BALANCE = 100;

  async function setup() {
    let [deployer, terminalOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let promises = [];
    promises.push(deployMockContract(deployer, jbOperatoreStore.abi));
    promises.push(deployMockContract(deployer, jbProjects.abi));
    promises.push(deployMockContract(deployer, jbDirectory.abi));
    promises.push(deployMockContract(deployer, jbSplitsStore.abi));
    promises.push(deployMockContract(deployer, jbEthPaymentTerminalStore.abi));
    promises.push(deployMockContract(deployer, jbController.abi));

    let [
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockSplitsStore,
      mockJbEthPaymentTerminalStore,
      mockJbController,
    ] = await Promise.all(promises);

    let jbTerminalFactory = await ethers.getContractFactory("JBETHPaymentTerminal", deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

    await mockJbEthPaymentTerminalStore.mock.claimFor
      .withArgs(futureTerminalAddress)
      .returns();

    let jbEthPaymentTerminal = await jbTerminalFactory.connect(deployer).deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockSplitsStore.address,
      mockJbEthPaymentTerminalStore.address,
      terminalOwner.address);

    return {
      terminalOwner,
      addrs,
      jbEthPaymentTerminal,
      mockJbDirectory,
      mockJbEthPaymentTerminalStore,
      mockJbController,
      timestamp
    }
  }

  it('Should return the remaining distribution limit of the project', async function () {
    const { deployer, jbEthPaymentTerminal, mockJbDirectory, mockJbController, mockJbEthPaymentTerminalStore, timestamp } = await setup();

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(mockJbController.address);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, jbEthPaymentTerminal.address)
      .returns(BALANCE);

    await mockJbEthPaymentTerminalStore.mock.usedDistributionLimitOf
      .withArgs(PROJECT_ID, FUNDING_CYCLE_NUMBER)
      .returns(BALANCE)

    expect(
      await jbEthPaymentTerminal.remainingDistributionLimitOf(
        PROJECT_ID,
        timestamp,
        FUNDING_CYCLE_NUMBER
      )
    ).to.equal(0);
  });
});
