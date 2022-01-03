import { expect } from 'chai';
import { ethers } from 'hardhat';
import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber } from '@ethersproject/bignumber';
import errors from '../helpers/errors.json';

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

  /**
   * Initialiazes mock price feed, adds it to JBPrices, and returns the fetched result.
   */
  async function addFeedAndFetchPrice(price, decimals, currency, base) {
    await aggregatorV3Contract.mock.latestRoundData.returns(0, price, 0, 0, 0);
    await aggregatorV3Contract.mock.decimals.returns(decimals);

    await jbPrices.connect(deployer).addFeedFor(currency, base, aggregatorV3Contract.address);
    return await jbPrices.connect(deployer).priceFor(currency, base);
  }

  it('Same currency and base should return 1', async function () {
    expect(
      await addFeedAndFetchPrice(/*price=*/ 400, /*decimals=*/ 18, /*currency=*/ 1, /*base=*/ 1),
    ).to.equal(ethers.BigNumber.from(10).pow(targetDecimals));
  });

  it('Check price no decimals', async function () {
    let price = 400;
    expect(
      await addFeedAndFetchPrice(price, /*decimals=*/ 0, /*currency=*/ 1, /*base=*/ 2),
    ).to.equal(ethers.BigNumber.from(price).mul(BigNumber.from(10).pow(targetDecimals)));
  });

  it('Check price one decimal', async function () {
    let price = 400;
    let decimals = 1;
    expect(await addFeedAndFetchPrice(price, decimals, /*currency=*/ 1, /*base=*/ 2)).to.equal(
      ethers.BigNumber.from(price).mul(BigNumber.from(10).pow(targetDecimals - decimals)),
    );
  });

  it('Check price 18 decimals', async function () {
    let price = 400;
    let decimals = 18;
    expect(await addFeedAndFetchPrice(price, decimals, /*currency=*/ 1, /*base=*/ 2)).to.equal(
      ethers.BigNumber.from(price),
    );
  });

  it('Check price 20 decimals', async function () {
    let price = 400;
    let decimals = 20;
    expect(await addFeedAndFetchPrice(price, decimals, /*currency=*/ 1, /*base=*/ 2)).to.equal(
      ethers.BigNumber.from(price).div(ethers.BigNumber.from(10).pow(decimals - targetDecimals)),
    );
  });

  it('Feed not found', async function () {
    await expect(
      jbPrices.connect(deployer).priceFor(/*currency=*/ 1, /*base=*/ 7),
    ).to.be.revertedWith(errors.NOT_FOUND);
  });
});
