import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';


import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';


describe('JBETHPaymentTerminal::ethBalanceOf(...)', function () {
  const PROJECT_ID = 13;
  const BALANCE = 100;

  async function setup() {
    let [deployer, terminalOwner, ...addrs] = await ethers.getSigners();

    let promises = [];

    promises.push(deployMockContract(deployer, jbOperatoreStore.abi));
    promises.push(deployMockContract(deployer, jbProjects.abi));
    promises.push(deployMockContract(deployer, jbDirectory.abi));
    promises.push(deployMockContract(deployer, jbSplitsStore.abi));
    promises.push(deployMockContract(deployer, jbEthPaymentTerminalStore.abi));

    let [
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockSplitsStore,
      mockJbEthPaymentTerminalStore,
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
      mockJbEthPaymentTerminalStore
    }
  }

  it('Should return the balance of the project', async function () {
    const { jbEthPaymentTerminal, mockJbEthPaymentTerminalStore } = await setup();

    await mockJbEthPaymentTerminalStore.mock.balanceOf
      .withArgs(PROJECT_ID)
      .returns(BALANCE)

    expect(await jbEthPaymentTerminal.ethBalanceOf(PROJECT_ID)).to.equal(BALANCE);
  });
});
