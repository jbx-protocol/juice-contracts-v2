import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import JBEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import jb18DecimalPaymentTerminalStore from '../../artifacts/contracts/JB18DecimalPaymentTerminalStore.sol/JB18DecimalPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';

describe('JB18DecimalPaymentTerminal::toggleFeelessTerminal(...)', function () {
  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJB18DecimalPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JBEthPaymentTerminal.abi),
      deployMockContract(deployer, jb18DecimalPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbPrices.abi),
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
        mockJbPrices.address,
        mockJB18DecimalPaymentTerminalStore.address,
        terminalOwner.address,
      );

    return {
      terminalOwner,
      caller,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
    };
  }

  it('Should add a terminal as feeless and emit event, if the terminal was not feeless before', async function () {
    const { terminalOwner, jbEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    expect(
      await jbEthPaymentTerminal
        .connect(terminalOwner)
        .toggleFeelessTerminal(mockJbEthPaymentTerminal.address),
    )
      .to.emit(jbEthPaymentTerminal, 'SetFeelessTerminal')
      .withArgs(mockJbEthPaymentTerminal.address, terminalOwner.address);

    expect(await jbEthPaymentTerminal.isFeelessTerminal(mockJbEthPaymentTerminal.address)).to.be
      .true;
  });

  it('Should remove a terminal as feeless and emit event, if the terminal was feeless before', async function () {
    const { terminalOwner, jbEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    await jbEthPaymentTerminal
      .connect(terminalOwner)
      .toggleFeelessTerminal(mockJbEthPaymentTerminal.address);

    expect(
      await jbEthPaymentTerminal
        .connect(terminalOwner)
        .toggleFeelessTerminal(mockJbEthPaymentTerminal.address),
    )
      .to.emit(jbEthPaymentTerminal, 'SetFeelessTerminal')
      .withArgs(mockJbEthPaymentTerminal.address, terminalOwner.address);

    expect(await jbEthPaymentTerminal.isFeelessTerminal(mockJbEthPaymentTerminal.address)).to.be
      .false;
  });
});
