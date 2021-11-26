import { ethers, network } from 'hardhat';

export function makePackedPermissions(permissionIndexes) {
  return permissionIndexes.reduce(
    (sum, i) => sum.add(ethers.BigNumber.from(2).pow(i)),
    ethers.BigNumber.from(0),
  );
}

export async function impersonateAccount(address) {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

  await network.provider.send('hardhat_setBalance', [
    address,
    '0x1000000000000000000000', // TODO(odd-amphora): This could be configurable.
  ]);

  return await ethers.getSigner(address);
}
