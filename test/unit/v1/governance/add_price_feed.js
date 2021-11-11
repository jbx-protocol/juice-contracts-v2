import { expect } from 'chai';
import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';

import {
  deployMockContract,
  deployMockLocalContract,
  getAddresses,
  getDeployer,
} from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'adds price feed',
      fn: () => ({
        caller: deployer,
      }),
    },
  ],
  failure: [
    {
      description: 'unauthorized',
      fn: () => ({
        caller: addrs[0].address,
        revert: 'Ownable: caller is not the owner',
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
        const { caller } = successTest.fn(this);

        const prices = await deployMockLocalContract('Prices');
        // Deploy a mock of the price feed oracle contract.
        const priceFeed = await deployMockContract(compilerOutput.abi);

        const currency = 1;

        await prices.mock.addFeed.withArgs(priceFeed.address, currency).returns();

        // Execute the transaction.
        await this.contract
          .connect(caller)
          .addPriceFeed(prices.address, priceFeed.address, currency);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, revert } = failureTest.fn(this);

        const prices = await deployMockLocalContract('Prices');
        // Deploy a mock of the price feed oracle contract.
        const priceFeed = await deployMockContract(compilerOutput.abi);

        const currency = 1;

        // Execute the transaction.
        await expect(
          this.contract.connect(caller).addPriceFeed(prices.address, priceFeed.address, currency),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
