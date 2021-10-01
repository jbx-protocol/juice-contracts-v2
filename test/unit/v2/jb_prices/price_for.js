const { ethers } = require('hardhat');
const { expect } = require('chai');

const tests = {
  success: [
    {
      description: 'same currency and base should return 1',
      fn: ({ deployer }) => ({
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
      fn: ({ deployer }) => ({
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
      fn: ({ deployer }) => ({
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
      fn: ({ deployer }) => ({
        caller: deployer,
        currency: 1,
        base: 2,
        decimals: 18,
        setPrice: 123456789,
        expectedPrice: 123456789,
      }),
    },
  ],
  failure: [
    {
      description: 'currency feed not found',
      fn: ({ deployer }) => ({
        caller: deployer,
        currency: 1,
        base: 2,
        price: 400,
        revert: '0x03: NOT_FOUND',
      }),
    },
  ],
};

module.exports = function () {
  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        const { caller, currency, base, decimals, setPrice, expectedPrice } = successTest.fn(this);

        // Set the mock to the return the specified number of decimals.
        await this.aggregatorV3Contract.mock.decimals.returns(decimals);
        // Set the mock to return the specified price.
        await this.aggregatorV3Contract.mock.latestRoundData.returns(0, setPrice, 0, 0, 0);

        // Add price feed.
        await this.contract
          .connect(caller)
          .addFeedFor(currency, base, this.aggregatorV3Contract.address);

        // Check for the price.
        const resultingPrice = await this.contract.connect(caller).priceFor(currency, base);

        // Get a reference to the target number of decimals.
        const targetDecimals = await this.contract.TARGET_DECIMALS();

        // Get a reference to the expected price value.
        const expectedPriceBigNum = ethers.BigNumber.from(expectedPrice).mul(
          ethers.BigNumber.from(10).pow(targetDecimals - (currency !== base ? decimals : 0)),
        );

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
};
