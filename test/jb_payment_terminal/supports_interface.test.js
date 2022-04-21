import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import interfaceSignatures from '../helpers/interface_signatures.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbPaymentTerminalStore from '../../artifacts/contracts/JBSingleTokenPaymentTerminalStore.sol/JBSingleTokenPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbPrices from '../../artifacts/contracts/JBPrices.sol/JBPrices.json';
import IERC20Metadata from '../../artifacts/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol/IERC20Metadata.json';

describe('JBPayoutRedemptionPaymentTerminal::supportsInterface(...)', function () {
  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      fakeToken,
      mockJbDirectory,
      mockJBPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
    ] = await Promise.all([
      deployMockContract(deployer, IERC20Metadata.abi),
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbPrices.abi),
    ]);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();
    const CURRENCY_USD = await jbCurrencies.USD();

    let jbEthTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    let jbErc20TerminalFactory = await ethers.getContractFactory(
      'JBERC20PaymentTerminal',
      deployer,
    );

    let jbEthPaymentTerminal = await jbEthTerminalFactory
      .connect(deployer)
      .deploy(
        CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJBPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await fakeToken.mock.decimals.returns(18);

    let jbErc20PaymentTerminal = await jbErc20TerminalFactory
      .connect(deployer)
      .deploy(
        fakeToken.address,
        CURRENCY_USD,
        CURRENCY_USD,
        1,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJBPaymentTerminalStore.address,
        terminalOwner.address,
      );

    return {
      jbEthPaymentTerminal,
      jbErc20PaymentTerminal,
      terminalOwner,
      caller,
    };
  }

  it('Supports IERC165', async function () {
    const { jbEthPaymentTerminal, jbErc20PaymentTerminal } = await setup();
    expect(
      await jbEthPaymentTerminal.supportsInterface(interfaceSignatures.IERC165)
    ).to.equal(true);

    expect(
      await jbErc20PaymentTerminal.supportsInterface(interfaceSignatures.IERC165)
    ).to.equal(true);
  });

  it('Supports IJBOperatable', async function () {
    const { jbEthPaymentTerminal, jbErc20PaymentTerminal } = await setup();
    expect(
      await jbEthPaymentTerminal.supportsInterface(interfaceSignatures.IJBOperatable)
    ).to.equal(true);

    expect(
      await jbErc20PaymentTerminal.supportsInterface(interfaceSignatures.IJBOperatable)
    ).to.equal(true);
  });

  it('Supports IJBPaymentTerminal', async function () {
    const { jbEthPaymentTerminal, jbErc20PaymentTerminal } = await setup();
    expect(
      await jbEthPaymentTerminal.supportsInterface(interfaceSignatures.IJBPaymentTerminal)
    ).to.equal(true);

    expect(
      await jbErc20PaymentTerminal.supportsInterface(interfaceSignatures.IJBPaymentTerminal)
    ).to.equal(true);
  });

  it('Supports IJBSingleTokenPaymentTerminal', async function () {
    const { jbEthPaymentTerminal, jbErc20PaymentTerminal } = await setup();
    expect(
      await jbEthPaymentTerminal.supportsInterface(interfaceSignatures.IJBSingleTokenPaymentTerminal)
    ).to.equal(true);

    expect(
      await jbErc20PaymentTerminal.supportsInterface(interfaceSignatures.IJBSingleTokenPaymentTerminal)
    ).to.equal(true);
  });

  it('Supports IJBPayoutRedemptionPaymentTerminal', async function () {
    const { jbEthPaymentTerminal, jbErc20PaymentTerminal } = await setup();
    expect(
      await jbEthPaymentTerminal.supportsInterface(interfaceSignatures.IJBPayoutRedemptionPaymentTerminal)
    ).to.equal(true);

    expect(
      await jbErc20PaymentTerminal.supportsInterface(interfaceSignatures.IJBPayoutRedemptionPaymentTerminal)
    ).to.equal(true);
  });

  it('Does not return true by default', async function () {
    const { jbEthPaymentTerminal, jbErc20PaymentTerminal } = await setup();
    expect(
      await jbEthPaymentTerminal.supportsInterface('0xffffffff')
    ).to.equal(false);

    expect(
      await jbErc20PaymentTerminal.supportsInterface('0xffffffff')
    ).to.equal(false);
  });
});
