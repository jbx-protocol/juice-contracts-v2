import { expect } from 'chai';
import { ethers } from 'hardhat';
import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

describe('JBPrices::priceFor(...)', function () {
  let deployer;
  let addrs;

  let aggregatorV3Contract;

  let jbPricesFactory;
  let jbPrices;
  let targetDecimals;

  beforeEach(async function () {
    [deployer, ...addrs] = await ethers.getSigners();

    aggregatorV3Contract = await deployMockContract(deployer, compilerOutput.abi);

    jbPricesFactory = await ethers.getContractFactory('JBPrices');
    jbPrices = await jbPricesFactory.deploy(deployer.address);

    targetDecimals = await jbPrices.TARGET_DECIMALS();
  });

  it('Same currency and base should return 1', async function () {
    let currency = 1;
    let base = 1;
    let price = 400;
    let decimals = 18;

    // Set the mock to return the specified price.
    await aggregatorV3Contract.mock.latestRoundData.returns(0, price, 0, 0, 0);
    await aggregatorV3Contract.mock.decimals.returns(decimals);

    // Add price feed.
    await jbPrices.connect(deployer).addFeedFor(currency, base, aggregatorV3Contract.address);

    // Check for the price.
    const resultingPrice = await jbPrices.connect(deployer).priceFor(currency, base);
    const expectedPrice = ethers.BigNumber.from(10).pow(targetDecimals);

    // Expect the stored price value to match the expected value.
    expect(resultingPrice).to.equal(expectedPrice);
  });
});
