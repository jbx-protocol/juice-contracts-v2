import { deployMockContract as _deployMockContract } from '@ethereum-waffle/mock-contract';
import { assert } from 'chai';
import { readFileSync } from 'fs';
import { sync } from 'glob';
import { ethers, config } from 'hardhat';

const deployer = async () => {
  let signers = await ethers.getSigners();
  assert(signers.length > 0, 'Signers are empty!');
  return signers[0];
};

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

// Bind some constants.
export const constants = {
  AddressZero: ethers.constants.AddressZero,
  MaxUint256: ethers.constants.MaxUint256,
  MaxInt256: ethers.BigNumber.from(2).pow(255).sub(1),
  MaxUint24: ethers.BigNumber.from(2).pow(24).sub(1),
  MaxUint16: ethers.BigNumber.from(2).pow(16).sub(1),
  MaxUint8: ethers.BigNumber.from(2).pow(8).sub(1),
};

export const deployMockContract = async (abi) => {
  return _deployMockContract(await deployer(), abi);
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
    min: canBeEmpty ? BigNumber.from(0) : BigNumber.from(1),
    favorEdges,
  });
  const candidate = prepend.concat(Math.random().toString(36).substr(2, seed));
  if (exclude.includes(candidate)) return randomString({ exclude, prepend, canBeEmpty });
  return candidate;
};

// Bind a function that returns a random set of bytes.
export const randomBytes = ({
  min = BigNumber.from(10),
  max = BigNumber.from(32),
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
