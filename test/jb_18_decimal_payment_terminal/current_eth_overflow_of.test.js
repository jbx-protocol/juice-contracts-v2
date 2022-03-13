import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jb18DecimalPaymentTerminalStore from '../../artifacts/contracts/JB18DecimalPaymentTerminalStore.sol/JB18DecimalPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JB18DecimalPaymentTerminal::currentEthOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const PRICE = ethers.BigNumber.from('100');
  let CURRENCY_ETH;
  let CURRENCY_USD;

  before(async function () {
    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    CURRENCY_ETH = await jbCurrencies.ETH();
    CURRENCY_USD = await jbCurrencies.USD();
  });

  async function setup() {
    let [deployer, terminalOwner, caller] =
      await ethers.getSigners();

    const SPLITS_GROUP = 1;

    let [
      mockJbDirectory,
      mockJB18DecimalPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
      mockJbToken,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jb18DecimalPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbPrices.abi),
      deployMockContract(deployer, jbToken.abi),
    ]);

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    let jbErc20TerminalFactory = await ethers.getContractFactory(
      'JB18DecimalERC20PaymentTerminal',
      deployer,
    );

    // ETH terminal
    let jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        /*base weight currency*/ CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJB18DecimalPaymentTerminalStore.address,
        terminalOwner.address,
      );

    // Non-eth 18 decimals terminal
    const NON_ETH_TOKEN = mockJbToken.address;
    const DECIMALS = 18;
    await mockJB18DecimalPaymentTerminalStore.mock.targetDecimals.returns(DECIMALS);
    await mockJbToken.mock.decimals.returns(DECIMALS);

    let JB18DecimalERC20PaymentTerminal = await jbErc20TerminalFactory
      .connect(deployer)
      .deploy(
        NON_ETH_TOKEN,
        CURRENCY_USD,
        CURRENCY_USD,
        SPLITS_GROUP,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockJB18DecimalPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockJB18DecimalPaymentTerminalStore.mock.currentOverflowOf.withArgs(jbEthPaymentTerminal.address, PROJECT_ID).returns(AMOUNT);
    await mockJB18DecimalPaymentTerminalStore.mock.currentOverflowOf.withArgs(JB18DecimalERC20PaymentTerminal.address, PROJECT_ID).returns(AMOUNT);

    await mockJB18DecimalPaymentTerminalStore.mock.prices.returns(mockJbPrices.address);

    return {
      caller,
      jbEthPaymentTerminal,
      JB18DecimalERC20PaymentTerminal,
      mockJbDirectory,
      mockJbPrices,
      mockJB18DecimalPaymentTerminalStore,
    };
  }

  it('Should return the current terminal overflow in eth if the terminal uses eth as currency', async function () {
    const { jbEthPaymentTerminal } = await setup();
    expect(await jbEthPaymentTerminal.currentEthOverflowOf(PROJECT_ID)).to.equal(AMOUNT);
  });
  it('Should return the current terminal overflow quoted in eth if the terminal uses another currency than eth', async function () {
    const { mockJbPrices, JB18DecimalERC20PaymentTerminal } = await setup();

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH, 18) // 18-decimal
      .returns(100);

    expect(await JB18DecimalERC20PaymentTerminal.currentEthOverflowOf(PROJECT_ID)).to.equal(AMOUNT.mul(ethers.utils.parseEther('1')).div(PRICE));
  });
});
