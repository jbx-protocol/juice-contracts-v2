// TODO(odd-amphora): Properly document all of these functions.

import { deployMockContract as _deployMockContract } from '@ethereum-waffle/mock-contract';
import { assert } from 'chai';
import { readFileSync } from 'fs';
import { sync } from 'glob';
import { ethers, config } from 'hardhat';
import { expect as _expect } from 'chai';

// Reads a contract.
const readContractAbi = (contractName) => {
  const files = sync(
    `${config.paths.artifacts}/contracts/**/${contractName}.sol/${contractName}.json`,
    {},
  );
  if (files.length == 0) {
    throw 'No files found!';
  }
  if (files.length > 1) {
    throw 'Multiple files found!';
  }
  return JSON.parse(readFileSync(files[0]).toString()).abi;
};

export const getDeployer = async () => {
  let signers = await ethers.getSigners();
  assert(signers.length > 0, 'Signers are empty!');
  return signers[0];
};

export const getAddresses = async () => {
  let [_, ...addresses] = await ethers.getSigners();
  assert(addresses.length > 1, 'Addresses are empty!');
  return addresses;
};

// Bind some constants.
export const constants = {
  AddressZero: ethers.constants.AddressZero,
  MaxUint256: ethers.constants.MaxUint256,
  MaxInt256: ethers.BigNumber.from(2).pow(255).sub(1),
  MaxUint24: ethers.BigNumber.from(2).pow(24).sub(1),
  MaxUint16: ethers.BigNumber.from(2).pow(16).sub(1),
  MaxUint8: ethers.BigNumber.from(2).pow(8).sub(1),
};

// Bind a reference to a function that can deploy a contract on the local network.
export const deployContract = async (contractName, args = []) => {
  const artifacts = await ethers.getContractFactory(contractName);
  return artifacts.deploy(...args);
};

export const deployMockContract = async (abi) => {
  return _deployMockContract(await getDeployer(), abi);
};

export const deployMockLocalContract = async (mockContractName) => {
  // Deploy mock contracts.
  return deployMockContract(readContractAbi(mockContractName));
};

export const randomBigNumber = ({
  min = ethers.BigNumber.from(0),
  max = this.constants.MaxUint256,
  precision = 10000000,
  favorEdges = true,
} = {}) => {
  // To test an edge condition, return the min or the max and the numbers around them more often.
  // Return the min or the max or the numbers around them 50% of the time.
  if (favorEdges && Math.random() < 0.5) {
    const r = Math.random();
    if (r <= 0.25 && min.add(1).lt(max)) return min.add(1);
    if (r >= 0.75 && max.sub(1).gt(min)) return max.sub(1);
    // return the min 50% of the time.
    return r < 0.5 ? min : max;
  }

  const base = max.sub(min);
  const randomInRange = base.gt(precision)
    ? base.div(precision).mul(ethers.BigNumber.from(Math.floor(Math.random() * precision)))
    : base.mul(ethers.BigNumber.from(Math.floor(Math.random() * precision))).div(precision);

  return randomInRange.add(min);
};

export const randomString = ({
  exclude = [],
  prepend = '',
  canBeEmpty = true,
  favorEdges = true,
} = {}) => {
  const seed = this.randomBigNumber({
    min: canBeEmpty ? ethers.BigNumber.from(0) : ethers.BigNumber.from(1),
    favorEdges,
  });
  const candidate = prepend.concat(Math.random().toString(36).substr(2, seed));
  if (exclude.includes(candidate)) return randomString({ exclude, prepend, canBeEmpty });
  return candidate;
};

// Bind a function that returns a random set of bytes.
export const randomBytes = ({
  min = ethers.BigNumber.from(10),
  max = ethers.BigNumber.from(32),
  prepend = '',
  exclude = [],
} = {}) => {
  const candidate = ethers.utils.formatBytes32String(
    randomString({
      prepend,
      seed: this.randomBigNumber({
        min,
        max,
      }),
      favorEdges: false,
    }),
  );
  if (exclude.includes(candidate)) return randomBytes({ exclude, min, max, prepend });
  return candidate;
};

// Bind a function that returns either true or false randomly.
export const randomBool = () => Math.random() > 0.5;

// Binds a function that makes sure the provided address has the balance
export const verifyBalance = async ({ address, expect, plusMinus }) => {
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

// Bind a function that mocks a contract function's execution with the provided args to return the provided values.
export const mockContractFunction = async ({ mockContract, fn, args, returns = [] }) => {
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

// Bind a function that checks if a contract getter equals an expected value.
export const verifyContractGetter = async ({ caller, contract, fn, args, expect, plusMinus }) => {
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

// Bind the ability to manipulate time to `this`.
// Bind a function that gets the current block's timestamp.
export const getTimestamp = async (block) => {
  return ethers.BigNumber.from((await ethers.provider.getBlock(block || 'latest')).timestamp);
};

export const snapshot = async () => {
  return ethers.provider.send('evm_snapshot', []);
};

export const restore = async (id) => {
  return ethers.provider.send('evm_revert', [id]);
};

export const getBalance = (address) => {
  return ethers.provider.getBalance(address);
};
