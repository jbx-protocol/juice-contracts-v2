import { expect } from 'chai';
import { ethers } from 'hardhat';
import jbChainlinkPriceFeed from '../../artifacts/contracts/JBChainlinkV3PriceFeed.sol/JBChainlinkV3PriceFeed.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber } from '@ethersproject/bignumber';
import errors from '../helpers/errors.json';

describe('JBPrices::priceFor(...)', function () {
  const DECIMALS = 1;

  let deployer;
  let addrs;

  let priceFeed;

  let jbPricesFactory;
  let jbPrices;

  beforeEach(async function () {
    [deployer, ...addrs] = await ethers.getSigners();

    priceFeed = await deployMockContract(deployer, jbChainlinkPriceFeed.abi);

    jbPricesFactory = await ethers.getContractFactory('JBPrices');
    jbPrices = await jbPricesFactory.deploy(deployer.address);
  });

  /**
   * Initialiazes mock price feed, adds it to JBPrices, and returns the fetched result.
   */
  async function addFeedAndFetchPrice(price, currency, base) {
    await priceFeed.mock.getPrice.withArgs(DECIMALS).returns(price);

    await jbPrices.connect(deployer).addFeedFor(currency, base, priceFeed.address);
    return await jbPrices.connect(deployer).priceFor(currency, base, DECIMALS);
  }

  it('Same currency and base should return 1', async function () {
    expect(await addFeedAndFetchPrice(/*price=*/ 400, /*currency=*/ 1, /*base=*/ 1)).to.equal(
      ethers.BigNumber.from(10).pow(DECIMALS),
    );
  });

  it('Check price 18 decimals', async function () {
    let price = 400;
    expect(await addFeedAndFetchPrice(price, /*currency=*/ 1, /*base=*/ 2, DECIMALS)).to.equal(
      ethers.BigNumber.from(price),
    );
  });

  it('Feed not found', async function () {
    await expect(
      jbPrices.connect(deployer).priceFor(/*currency=*/ 1, /*base=*/ 7, DECIMALS),
    ).to.be.revertedWith(errors.PRICE_FEED_NOT_FOUND);
  });
});
