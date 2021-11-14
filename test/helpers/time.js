import { time } from '@openzeppelin/test-helpers';
import { ethers } from 'hardhat';

export async function latest() {
  let l = await time.latest();
  return ethers.BigNumber.from(l.toString());
}

export async function increaseTo(from, amount) {
  await time.increaseTo(from.add(amount).toNumber());
}

export async function increaseBy(amount) {
  await time.increase(amount.toNumber());
}

export async function getBlockTimestamp(block) {
  return ethers.BigNumber.from((await ethers.provider.getBlock(block || 'latest')).timestamp);
};