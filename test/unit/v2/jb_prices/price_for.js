import { ethers } from 'hardhat';
import { expect } from 'chai';

import { getAddresses, getDeployer } from '../../../utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'same currency and base should return 1',
      fn: () => ({
        caller: deployer,
        currency: 1,
        base: 1,
        decimals: 18,
        setPrice: 400,
        expectedPrice: 1,
      }),
    },
    {
      description: 'check price no decimals',
      fn: () => ({
        caller: deployer,
        currency: 1,
        base: 2,
        decimals: 0,
        setPrice: 400,
        expectedPrice: 400,
      }),
    },
    {
      description: 'check price one decimal',
      fn: () => ({
        caller: deployer,
        currency: 1,
        base: 2,
        decimals: 1,
        setPrice: 4000,
        expectedPrice: 4000,
      }),
    },
    {
      description: 'check price 18 decimals',
      fn: () => ({
        caller: deployer,
        currency: 1,
        base: 2,
        decimals: 18,
        setPrice: 123456789,
        expectedPrice: 123456789,
      }),
    },
    {
      description: 'check price 20 decimals',
      fn: () => ({
        caller: deployer,
        currency: 1,
        base: 2,
        decimals: 20,
        setPrice: 123456789,
        expectedPrice: 123456789,
      }),
    },
  ],
  failure: [
    {
      description: 'currency feed not found',
      fn: () => ({
        caller: deployer,
        currency: 1,
        base: 2,
        price: 400,
        revert: '0x03: NOT_FOUND',
      }),
    },
  ],
};

export default function () {
  before(async function () {
    deployer = await getDeployer();
    addrs = await getAddresses();
  });

  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        const { caller, currency, base, decimals, setPrice, expectedPrice } = successTest.fn(this);

        // Set the mock to return the specified price.
        await this.aggregatorV3Contract.mock.latestRoundData.returns(0, setPrice, 0, 0, 0);

        // Set the mock to the return the specified number of decimals.
        await this.aggregatorV3Contract.mock.decimals.returns(decimals);

        // Add price feed.
        await this.contract
          .connect(caller)
          .addFeedFor(currency, base, this.aggregatorV3Contract.address);

        // Check for the price.
        const resultingPrice = await this.contract.connect(caller).priceFor(currency, base);

        // Get a reference to the target number of decimals.
        const targetDecimals = await this.contract.TARGET_DECIMALS();

        // Get a reference to the expected price value.
        let expectedPriceBigNum;

        if (currency == base) {
          expectedPriceBigNum = ethers.BigNumber.from(10).pow(targetDecimals);
        } else if (targetDecimals.eq(decimals)) {
          expectedPriceBigNum = ethers.BigNumber.from(expectedPrice);
        } else if (decimals < targetDecimals) {
          expectedPriceBigNum = ethers.BigNumber.from(expectedPrice).mul(
            ethers.BigNumber.from(10).pow(targetDecimals - decimals),
          );
        } else {
          expectedPriceBigNum = ethers.BigNumber.from(expectedPrice).div(
            ethers.BigNumber.from(10).pow(decimals - targetDecimals),
          );
        }

        // Expect the stored price value to match the expected value.
        expect(resultingPrice).to.equal(expectedPriceBigNum);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, currency, base, price, revert } = failureTest.fn(this);

        await this.aggregatorV3Contract.mock.latestRoundData.returns(0, price, 0, 0, 0);

        await expect(this.contract.connect(caller).priceFor(currency, base)).to.be.revertedWith(
          revert,
        );
      });
    });
  });
}
