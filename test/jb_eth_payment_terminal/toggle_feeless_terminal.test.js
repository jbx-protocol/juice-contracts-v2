import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import JbEthPaymentTerminal from '../../artifacts/contracts/JBETHPaymentTerminal.sol/JBETHPaymentTerminal.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';

describe('JBETHPaymentTerminal::toggleFeelessTerminal(...)', function () {
  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

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

    return {
      terminalOwner,
      caller,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminal,
    };
  }

  it('Should add a terminal as feeless and emit event, if the terminal was not feeless before', async function () {
    const { terminalOwner, jbEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    expect(await jbEthPaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbEthPaymentTerminal.address))
      .to.emit(jbEthPaymentTerminal, 'SetFeelessTerminal')
      .withArgs(mockJbEthPaymentTerminal.address, terminalOwner.address);
    
    expect(await jbEthPaymentTerminal.isFeelessTerminal(mockJbEthPaymentTerminal.address)).to.be.true;
  });

  it('Should remove a terminal as feeless and emit event, if the terminal was feeless before', async function () {
    const { terminalOwner, jbEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    await jbEthPaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbEthPaymentTerminal.address);

    expect(await jbEthPaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbEthPaymentTerminal.address))
      .to.emit(jbEthPaymentTerminal, 'SetFeelessTerminal')
      .withArgs(mockJbEthPaymentTerminal.address, terminalOwner.address);
    
    expect(await jbEthPaymentTerminal.isFeelessTerminal(mockJbEthPaymentTerminal.address)).to.be.false;
  });
});
