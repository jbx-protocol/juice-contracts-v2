import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import JbERC20PaymentTerminal from '../../artifacts/contracts/JBERC20PaymentTerminal.sol/JBERC20PaymentTerminal.json';
import JBPaymentTerminalStore from '../../artifacts/contracts/JBPaymentTerminalStore.sol/JBPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';

describe('JBERC20PaymentTerminal::toggleFeelessTerminal(...)', function () {
  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbERC20PaymentTerminal,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, JbERC20PaymentTerminal.abi),
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
      caller,
      jbERC20PaymentTerminal,
      mockJbERC20PaymentTerminal,
    };
  }

  it('Should add a terminal as feeless and emit event, if the terminal was not feeless before', async function () {
    const { terminalOwner, jbERC20PaymentTerminal, mockJbERC20PaymentTerminal } = await setup();

    expect(await jbERC20PaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbERC20PaymentTerminal.address))
      .to.emit(jbERC20PaymentTerminal, 'SetFeelessTerminal')
      .withArgs(mockJbERC20PaymentTerminal.address, terminalOwner.address);
    
    expect(await jbERC20PaymentTerminal.isFeelessTerminal(mockJbERC20PaymentTerminal.address)).to.be.true;
  });

  it('Should remove a terminal as feeless and emit event, if the terminal was feeless before', async function () {
    const { terminalOwner, jbERC20PaymentTerminal, mockJbERC20PaymentTerminal } = await setup();

    await jbERC20PaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbERC20PaymentTerminal.address);

    expect(await jbERC20PaymentTerminal.connect(terminalOwner).toggleFeelessTerminal(mockJbERC20PaymentTerminal.address))
      .to.emit(jbERC20PaymentTerminal, 'SetFeelessTerminal')
      .withArgs(mockJbERC20PaymentTerminal.address, terminalOwner.address);
    
    expect(await jbERC20PaymentTerminal.isFeelessTerminal(mockJbERC20PaymentTerminal.address)).to.be.false;
  });
});
