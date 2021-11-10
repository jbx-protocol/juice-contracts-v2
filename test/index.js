import { ethers } from 'hardhat';
import { expect as _expect } from 'chai';

import { Contract } from 'ethers';
import unit from './unit';
import integration from './integration';

import { getTimestamp } from './utils'

describe('Juicebox', async function () {
  before(async function () {
    // Bind a reference to the deployer address and an array of other addresses to `this`.
    [this.deployer, ...this.addrs] = await ethers.getSigners();

    // Binds a function that sets a time mark that is taken into account while fastforward.
    this.setTimeMarkFn = async (blockNumber) => {
      this.timeMark = await getTimestamp(blockNumber);
    };

    // Binds a function that fastforward a certain amount from the beginning of the test, or from the latest time mark if one is set.
    this.fastforwardFn = async (seconds) => {
      const now = await getTimestamp();
      const timeSinceTimemark = now.sub(this.timeMark);
      const fastforwardAmount = seconds.toNumber() - timeSinceTimemark;
      this.timeMark = now.add(fastforwardAmount);

      // Subtract away any time that has already passed between the start of the test,
      // or from the last fastforward, from the provided value.
      await ethers.provider.send('evm_increaseTime', [fastforwardAmount]);
      // Mine a block.
      await ethers.provider.send('evm_mine');
    };

    // Binds a function that gets the balance of an address.
    this.getBalanceFn = (address) => ethers.provider.getBalance(address);

    // Binds the standard expect function.
    this.expectFn = _expect;

    // Bind a function that gets a random address.
    this.randomAddressFn = ({ exclude = [] } = {}) => {
      // To test an edge condition, pick the same address more likely than not.
      // return address0 50% of the time.
      const candidate =
        Math.random() < 0.5
          ? this.addrs[0].address
          : this.addrs[Math.floor(Math.random() * 9)].address;
      if (exclude.includes(candidate)) return this.randomAddressFn({ exclude });

      return candidate;
    };

    // Bind a function that gets a random signed.
    this.randomSignerFn = ({ exclude = [] } = {}) => {
      // To test an edge condition, pick the same address more likely than not.
      // return address0 50% of the time.
      const candidate =
        Math.random() < 0.5 ? this.addrs[0] : this.addrs[Math.floor(Math.random() * 9)];
      if (exclude.includes(candidate.address)) return this.randomSignerFn({ exclude });
      return candidate;
    };

    // Bind the big number utils.
    this.BigNumber = ethers.BigNumber;

    this.stringToBytes = ethers.utils.formatBytes32String;
  });

  // Before each test, take a snapshot of the contract state.
  beforeEach(async function () {
    // Make the start time of the test available.
    this.testStart = await getTimestamp();
  });

  // Run the tests.
  describe('Unit', unit);
  describe('Integration', integration);
});
