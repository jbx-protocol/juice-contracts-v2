import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';

export async function getTimestampFn(block) {
  return ethers.BigNumber.from((await ethers.provider.getBlock(block || 'latest')).timestamp);
};

export async function fastforwardFn(block, seconds) {
  const now = await getTimestampFn();
  const timeSinceTimemark = now.sub(await getTimestampFn(block));
  const fastforwardAmount = seconds.toNumber() - timeSinceTimemark;

  // Subtract away any time that has already passed between the start of the test,
  // or from the last fastforward, from the provided value.
  await ethers.provider.send('evm_increaseTime', [fastforwardAmount]);
  // Mine a block.
  await ethers.provider.send('evm_mine');
};

export function makePackedPermissions(permissionIndexes) {
  return permissionIndexes.reduce(
    (sum, i) => sum.add(ethers.BigNumber.from(2).pow(i)),
    ethers.BigNumber.from(0),
  );
}

export async function impersonateAccount(
  address,
  balance = BigNumber.from('0x1000000000000000000000'),
) {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

  await network.provider.send('hardhat_setBalance', [address, balance.toHexString()]);

  return await ethers.getSigner(address);
}

export async function deployJbToken(name, symbol) {
  const jbTokenFactory = await ethers.getContractFactory('JBToken');
  return await jbTokenFactory.deploy(name, symbol);
}
