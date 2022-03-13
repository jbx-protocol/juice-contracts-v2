import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata } from '../helpers/utils';

import jbController from '../../artifacts/contracts/interfaces/IJBController.sol/IJBController.json';
import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbPaymentTerminal from '../../artifacts/contracts/interfaces/IJB18DecimalPaymentTerminal.sol/IJB18DecimalPaymentTerminal.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JB18DecimalPaymentTerminalStore::currentTotalOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const WEIGHT = ethers.BigNumber.from('1'+'0'.repeat(17));

  const ETH_OVERFLOW_A = ethers.utils.parseEther('69000');
  const ETH_OVERFLOW_B = ethers.utils.parseEther('420');
  const PRICE = ethers.BigNumber.from('100');

  let decimals;

  async function setup() {
    const [deployer] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, jbController.abi);
    const mockJbTerminalA = await deployMockContract(deployer, jbPaymentTerminal.abi);
    const mockJbTerminalB = await deployMockContract(deployer, jbPaymentTerminal.abi);

    const jbCurrenciesFactory = await ethers.getContractFactory('JBCurrencies');
    const jbCurrencies = await jbCurrenciesFactory.deploy();
    const CURRENCY_ETH = await jbCurrencies.ETH();
    const CURRENCY_USD = await jbCurrencies.USD();

    const JB18DecimalPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'JB18DecimalPaymentTerminalStore',
    );
    const JB18DecimalPaymentTerminalStore = await JB18DecimalPaymentTerminalStoreFactory.deploy(
      mockJbPrices.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
    );

    decimals = await JB18DecimalPaymentTerminalStore.TARGET_DECIMALS();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    return {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should return total current overflow across multiple terminals with the same currency as the one passed', async function () {
    const {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({useLocalBalanceForRedemptions: false}),
    });

    await mockJbDirectory.mock.terminalsOf
      .withArgs(PROJECT_ID)
      .returns([mockJbTerminalA.address, mockJbTerminalB.address]);

    await mockJbTerminalA.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_A);
    await mockJbTerminalB.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_B);

    // Get total overflow across both terminals, in same currency; should equal sum of the overflows
    expect(
      await JB18DecimalPaymentTerminalStore.currentTotalOverflowOf(PROJECT_ID, CURRENCY_ETH),
    ).to.equal(ETH_OVERFLOW_A.add(ETH_OVERFLOW_B));
  });

  it('Should return total current overflow across multiple terminals with different currency as the one passed', async function () {
    const {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      JB18DecimalPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({useLocalBalanceForRedemptions: false}),
    });

    await mockJbDirectory.mock.terminalsOf
      .withArgs(PROJECT_ID)
      .returns([mockJbTerminalA.address, mockJbTerminalB.address]);

    await mockJbTerminalA.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_A);
    await mockJbTerminalB.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_B);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_USD, 18) // 18-decimal
      .returns(100);

    // Get total overflow across both terminals, in a different currency; should equal to the sum of the overflow / price
    expect(
      await JB18DecimalPaymentTerminalStore.currentTotalOverflowOf(PROJECT_ID, CURRENCY_USD),
    ).to.equal( (ETH_OVERFLOW_A.add(ETH_OVERFLOW_B)).mul(ethers.utils.parseEther('1')).div(PRICE));
  });
});
