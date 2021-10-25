import { ethers } from 'hardhat';
import { expect as _expect } from 'chai';

import { Contract } from 'ethers';
import unit from './unit';
import integration from './integration';

describe('Juicebox', async function () {
  before(async function () {
    // Bind a reference to the deployer address and an array of other addresses to `this`.
    [this.deployer, ...this.addrs] = await ethers.getSigners();

    // Bind the ability to manipulate time to `this`.
    // Bind a function that gets the current block's timestamp.
    this.getTimestampFn = async (block) => {
      return ethers.BigNumber.from((await ethers.provider.getBlock(block || 'latest')).timestamp);
    };

    // Binds a function that sets a time mark that is taken into account while fastforward.
    this.setTimeMarkFn = async (blockNumber) => {
      this.timeMark = await this.getTimestampFn(blockNumber);
    };

    // Binds a function that fastforward a certain amount from the beginning of the test, or from the latest time mark if one is set.
    this.fastforwardFn = async (seconds) => {
      const now = await this.getTimestampFn();
      const timeSinceTimemark = now.sub(this.timeMark);
      const fastforwardAmount = seconds.toNumber() - timeSinceTimemark;
      this.timeMark = now.add(fastforwardAmount);

      // Subtract away any time that has already passed between the start of the test,
      // or from the last fastforward, from the provided value.
      await ethers.provider.send('evm_increaseTime', [fastforwardAmount]);
      // Mine a block.
      await ethers.provider.send('evm_mine');
    };

    // Bind a reference to a function that can deploy a contract on the local network.
    this.deployContractFn = async (contractName, args = []) => {
      const artifacts = await ethers.getContractFactory(contractName);
      return artifacts.deploy(...args);
    };

    // Bind a function that mocks a contract function's execution with the provided args to return the provided values.
    this.mockFn = async ({ mockContract, fn, args, returns = [] }) => {
      // The `args` can be a function or an array.
      const normalizedArgs = args && typeof args === 'function' ? await args() : args;

      // The `returns` value can be a function or an array.
      const normalizedReturns = typeof returns === 'function' ? await returns() : returns;

      // Get a reference to the mock.
      const mock = mockContract.mock[fn];

      // If args were provided, make the the mock only works if invoked with the provided args.
      if (normalizedArgs) mock.withArgs(...normalizedArgs);

      // Set its return value.
      await mock.returns(...normalizedReturns);
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

    // Bind a function that sends funds from one address to another.
    this.sendTransactionFn = async ({ from, to, value, revert, events }) => {
      // Transfer the funds.
      const promise = from.sendTransaction({
        to,
        value,
      });

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
          .to.emit(event.contract, event.name)
          .withArgs(...event.args),
      );
    };

    // Bind a function that checks if a contract getter equals an expected value.
    this.checkFn = async ({ caller, contract, fn, args, expect, plusMinus }) => {
      const storedVal = await contract.connect(caller)[fn](...args);
      if (plusMinus) {
        console.log({
          storedVal,
          diff: storedVal.sub(expect),
          plusMinus: plusMinus.amount,
        });
        _expect(storedVal.lte(expect.add(plusMinus.amount))).to.equal(true);
        _expect(storedVal.gte(expect.sub(plusMinus.amount))).to.equal(true);
      } else {
        _expect(storedVal).to.deep.equal(expect);
      }
    };

    // Binds a function that makes sure the provided address has the balance
    this.verifyBalanceFn = async ({ address, expect, plusMinus }) => {
      const storedVal = await ethers.provider.getBalance(address);
      if (plusMinus) {
        console.log({
          storedVal,
          diff: storedVal.sub(expect),
          plusMinus: plusMinus.amount,
        });
        _expect(storedVal.lte(expect.add(plusMinus.amount))).to.equal(true);
        _expect(storedVal.gte(expect.sub(plusMinus.amount))).to.equal(true);
      } else {
        _expect(storedVal).to.deep.equal(expect);
      }
    };

    // Binds a function that gets the balance of an address.
    this.getBalanceFn = (address) => ethers.provider.getBalance(address);

    // Binds the standard expect function.
    this.expectFn = _expect;

    // Bind some constants.

    this.constants = {
      AddressZero: ethers.constants.AddressZero,
      MaxUint256: ethers.constants.MaxUint256,
      MaxInt256: ethers.BigNumber.from(2).pow(255).sub(1),
      MaxUint24: ethers.BigNumber.from(2).pow(24).sub(1),
      MaxUint16: ethers.BigNumber.from(2).pow(16).sub(1),
      MaxUint8: ethers.BigNumber.from(2).pow(8).sub(1),
    };

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

    // Bind a function that returns either true or false randomly.
    this.randomBoolFn = () => Math.random() > 0.5;

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
    this.testStart = await this.getTimestampFn();
  });

  // Run the tests.
  describe('Unit', unit);
  describe('Integration', integration);
});
