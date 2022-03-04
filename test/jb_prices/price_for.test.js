import { expect } from 'chai';
import { ethers } from 'hardhat';
// import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';
import jbChainlinkPriceFeed from '../../artifacts/contracts/JBChainlinkPriceFeed.sol/JBChainlinkPriceFeed.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber } from '@ethersproject/bignumber';
import errors from '../helpers/errors.json';

describe.only('JBPrices::priceFor(...)', function () {
  let deployer;
  let addrs;

  let priceFeed;

  let jbPricesFactory;
  let jbPrices;
  let targetDecimals;

  beforeEach(async function () {
    [deployer, ...addrs] = await ethers.getSigners();

    priceFeed = await deployMockContract(deployer, jbChainlinkPriceFeed.abi);

    jbPricesFactory = await ethers.getContractFactory('JBPrices');
    jbPrices = await jbPricesFactory.deploy(deployer.address);

    targetDecimals = await jbPrices.TARGET_DECIMALS();
  });

  /**
   * Initialiazes mock price feed, adds it to JBPrices, and returns the fetched result.
  */
  async function addFeedAndFetchPrice(price, currency, base) {
    await priceFeed.mock.getPrice.withArgs(targetDecimals).returns(price);

    await jbPrices.connect(deployer).addFeedFor(currency, base, priceFeed.address);
    return await jbPrices.connect(deployer).priceFor(currency, base);
  }

  it('Same currency and base should return 1', async function () {
    expect(
      await addFeedAndFetchPrice(/*price=*/ 400, /*currency=*/ 1, /*base=*/ 1),
    ).to.equal(ethers.BigNumber.from(10).pow(targetDecimals));
  });

  it('Check price 18 decimals', async function () {
    let price = 400;
    expect(await addFeedAndFetchPrice(price, /*currency=*/ 1, /*base=*/ 2)).to.equal(
      ethers.BigNumber.from(price),
    );
  });

  it('Feed not found', async function () {
    await expect(
      jbPrices.connect(deployer).priceFor(/*currency=*/ 1, /*base=*/ 7),
    ).to.be.revertedWith(errors.PRICE_FEED_NOT_FOUND);
  });
});
