import { expect } from 'chai';
import { ethers } from 'hardhat';
import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber } from '@ethersproject/bignumber';

describe('JBChainlinkPriceFeed::getPrice(...)', function () {
  let deployer;
  let addrs;

  let aggregatorV3Contract;

  let jbChainlinkPriceFeedFactory;
  let jbChainlinkPriceFeed;
  let targetDecimals = 18;

  beforeEach(async function () {
    [deployer, ...addrs] = await ethers.getSigners();

    aggregatorV3Contract = await deployMockContract(deployer, compilerOutput.abi);

    jbChainlinkPriceFeedFactory = await ethers.getContractFactory('JBChainlinkPriceFeed');
    jbChainlinkPriceFeed = await jbChainlinkPriceFeedFactory.deploy(aggregatorV3Contract.address);
  });

  /**
   * Initialiazes mock price feed, adds it to JBPrices, and returns the fetched result.
   */
  async function getPrice(price, decimals) {
    await aggregatorV3Contract.mock.latestRoundData.returns(0, price, 0, 0, 0);
    await aggregatorV3Contract.mock.decimals.returns(decimals);
    return await jbChainlinkPriceFeed.connect(deployer).getPrice(targetDecimals);
  }

  it('Get price no decimals', async function () {
    let price = 400;
    expect(await getPrice(price, /*decimals=*/ 0)).to.equal(
      ethers.BigNumber.from(price).mul(BigNumber.from(10).pow(targetDecimals)),
    );
  });

  it('Check price less than target decimal', async function () {
    let price = 400;
    let decimals = targetDecimals - 1;
    expect(await getPrice(price, decimals)).to.equal(
      ethers.BigNumber.from(price).mul(BigNumber.from(10).pow(targetDecimals - decimals)),
    );
  });

  it('Check price target decimals', async function () {
    let price = 400;
    expect(await getPrice(price, targetDecimals)).to.equal(ethers.BigNumber.from(price));
  });

  it('Check price more than target decimals', async function () {
    let price = 400;
    let decimals = targetDecimals + 1;
    expect(await getPrice(price, decimals)).to.equal(
      ethers.BigNumber.from(price).div(ethers.BigNumber.from(10).pow(decimals - targetDecimals)),
    );
  });
});
