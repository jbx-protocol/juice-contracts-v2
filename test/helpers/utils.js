import { BigNumber } from 'ethers';

export function makePackedPermissions(permissionIndexes) {
  return permissionIndexes.reduce((sum, i) => sum.add(BigNumber.from(2).pow(i)), BigNumber.from(0));
}

export function daysFromNow(days) {
  let date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
  
export function daysFromDate(date, days) {
  let newDate = new Date();
  newDate.setDate(date.getDate() + days)
  return newDate;
}
  
export function dateInSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}