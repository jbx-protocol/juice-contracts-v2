import { expect } from 'chai';
import { ethers } from 'hardhat';
import errors from '../helpers/errors.json';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';

describe('JBPaymentTerminal::setFee(...)', function () {
  const NEW_FEE = 8; // 4%

  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JBPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

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

    return {
      jbEthPaymentTerminal,
      terminalOwner,
      caller,
    };
  }

  it('Should set new fee and emit event if caller is terminal owner', async function () {
    const { jbEthPaymentTerminal, terminalOwner } = await setup();

    expect(await jbEthPaymentTerminal.connect(terminalOwner).setFee(NEW_FEE))
      .to.emit(jbEthPaymentTerminal, 'SetFee')
      .withArgs(NEW_FEE, terminalOwner.address);
  });

  it("Can't set fee above 5%", async function () {
    const { jbEthPaymentTerminal, terminalOwner } = await setup();
    await expect(jbEthPaymentTerminal.connect(terminalOwner).setFee(50_000_001)) // 5.0000001% (out of 1,000,000,000)
      .to.be.revertedWith(errors.FEE_TOO_HIGH);
  });
});
