import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';

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

export function daysFromNow(days) {
  let date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function daysFromDate(date, days) {
  let newDate = new Date();
  newDate.setDate(date.getDate() + days);
  return newDate;
}

export function dateInSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Returns a mock FundingCyleMetadata packed into a BigNumber
 * @summary Should mirror the bit logic in JBFundingCycleMetadataResolver.sol.
 * @param {custom obj} e.g. packFundingCycleMetadata({ reservedRate: 3500, pausePay: 1})
 * @return {ethers.BigNumber}
 * @note Passing in an empty obj will use default values below
 */
export function packFundingCycleMetadata({
  version = 1,
  reservedRate = 0, // percentage
  redemptionRate = 10000, // percentage
  ballotRedemptionRate = 10000, // percentage
  pausePay = 0, // boolean
  pauseDistributions = 0, // boolean
  pauseRedeem = 0, // boolean
  pauseMint = 0, // boolean
  pauseBurn = 0, // boolean
  allowChangeToken = 0, // boolean
  allowTerminalMigration = 0, // boolean
  allowControllerMigration = 0, // boolean
  holdFees = 0, // boolean
  useLocalBalanceForRedemptions = 0, // boolean
  useDataSourceForPay = 0, // boolean
  useDataSourceForRedeem = 0, // boolean
  dataSource = 0, // address
} = {}) {
  const one = ethers.BigNumber.from(1);

  // version 1 in the bits 0-7 (8 bits).
  var packed = ethers.BigNumber.from(version);
  // reserved rate in bits 8-23 (16 bits).
  packed = packed.or(ethers.BigNumber.from(reservedRate).shl(8));
  // redemption rate in bits 24-39 (16 bits).
  // redemption rate is a number 0-10000. Store the reverse so the most common case of 100% results in no storage needs.
  packed = packed.or(ethers.BigNumber.from(10000 - redemptionRate).shl(24));
  // ballot redemption rate rate in bits 40-55 (16 bits).
  // ballot redemption rate is a number 0-10000. Store the reverse so the most common case of 100% results in no storage needs.
  packed = packed.or(ethers.BigNumber.from(10000 - ballotRedemptionRate).shl(40));
  // pause pay in bit 56.
  if (pausePay) packed = packed.or(one.shl(56));
  // pause tap in bit 57.
  if (pauseDistributions) packed = packed.or(one.shl(57));
  // pause redeem in bit 58.
  if (pauseRedeem) packed = packed.or(one.shl(58));
  // pause mint in bit 59.
  if (pauseMint) packed = packed.or(one.shl(59));
  // pause mint in bit 60.
  if (pauseBurn) packed = packed.or(one.shl(60));
  // pause change token in bit 61.
  if (allowChangeToken) packed = packed.or(one.shl(61));
  // allow terminal migration in bit 62.
  if (allowTerminalMigration) packed = packed.or(one.shl(62));
  // allow controller migration in bit 63.
  if (allowControllerMigration) packed = packed.or(one.shl(63));
  // hold fees in bit 64.
  if (holdFees) packed = packed.or(one.shl(64));
  // useLocalBalanceForRedemptions in bit 65.
  if (useLocalBalanceForRedemptions) packed = packed.or(one.shl(65));
  // use pay data source in bit 66.
  if (useDataSourceForPay) packed = packed.or(one.shl(66));
  // use redeem data source in bit 67.
  if (useDataSourceForRedeem) packed = packed.or(one.shl(67));
  // data source address in bits 68-227.
  packed = packed.or(ethers.BigNumber.from(dataSource).shl(68));

  return packed;
}
