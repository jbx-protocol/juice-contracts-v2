import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';

export async function getTimestamp(block) {
  return ethers.BigNumber.from((await ethers.provider.getBlock(block || 'latest')).timestamp);
};

export async function fastForward(block, seconds) {
  const now = await getTimestamp();
  const timeSinceTimemark = now.sub(await getTimestamp(block));
  const fastforwardAmount = seconds.toNumber() - timeSinceTimemark;
  await ethers.provider.send('evm_increaseTime', [fastforwardAmount]);
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
