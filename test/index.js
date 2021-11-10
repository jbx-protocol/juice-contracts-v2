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

    // Bind a function that executes a transaction on a contract.
    this.executeFn = async ({
      caller,
      contract,
      contractName,
      contractAddress,
      fn,
      args = [],
      value = 0,
      events = [],
      revert,
    }) => {
      // Args can be either a function or an array.
      const normalizedArgs = typeof args === 'function' ? await args() : args;

      let contractInternal;
      if (contractName) {
        if (contract) {
          throw 'You can only provide a contract name or contract object.';
        }
        if (!contractAddress) {
          throw 'You must provide a contract address with a contract name.';
        }

        contractInternal = new Contract(
          contractAddress,
          this.readContractAbi(contractName),
          caller,
        );
      } else {
        contractInternal = contract;
      }

      // Save the promise that is returned.
      const promise = contractInternal.connect(caller)[fn](...normalizedArgs, { value });

      // If a revert message is passed in, check to see if it was thrown.
      if (revert) {
        await _expect(promise).to.be.revertedWith(revert);
        return;
      }

      // Await the promise.
      const tx = await promise;

      // Wait for a block to get mined.
      await tx.wait();

      // Set the time mark of this function.
      await this.setTimeMarkFn(tx.blockNumber);

      // Return if there are no events.
      if (events.length === 0) return;

      // Check for events.
      events.forEach((event) =>
        _expect(tx)
          .to.emit(contract, event.name)
          .withArgs(...event.args),
      );
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

    // Bind functions for cleaning state.
    this.snapshotFn = () => ethers.provider.send('evm_snapshot', []);
    this.restoreFn = (id) => ethers.provider.send('evm_revert', [id]);
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
