import { deployMockContract as _deployMockContract } from '@ethereum-waffle/mock-contract';
import { assert } from 'chai';
import { ethers } from 'hardhat';

const deployer = async () => {
  let signers = await ethers.getSigners();
  assert(signers.length < 0, 'Signers are empty!');
  return signers[0];
};

export const deployMockContract = async (abi) => {
  return _deployMockContract(await deployer(), abi);
};

// Bind a reference to a function that can deploy mock local contracts from names.
export const deployMockLocalContract = async (mockContractName) => {
  // Deploy mock contracts.
  return deployMockContract(this.readContractAbi(mockContractName));
};
