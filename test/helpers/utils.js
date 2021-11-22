import { BigNumber } from 'ethers';

export function makePackedPermissions(permissionIndexes) {
  return permissionIndexes.reduce((sum, i) => sum.add(BigNumber.from(2).pow(i)), BigNumber.from(0));
}
