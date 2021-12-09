import { BigNumber } from '@ethersproject/bignumber';
import { ethers, network } from 'hardhat';

/**
 * Pack array of permission indexes into BigNumber
 * @param {number[]} permissionIndexes
 * @return {ethers.BigNumber}
 */
export function makePackedPermissions(permissionIndexes) {
  return permissionIndexes.reduce(
    (sum, i) => sum.add(ethers.BigNumber.from(2).pow(i)),
    ethers.BigNumber.from(0),
  );
}

/**
 * Create a test account
 * @param {string} address
 * @param {ethers.BigNumber} balance
 * @return {ethers.JsonRpcSigner}
 */
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

/**
 * Deploy a test JBToken contract
 * @param {string} name
 * @param {string} symbol
 * @return {ethers.Contract}
 */
export async function deployJbToken(name, symbol) {
  const jbTokenFactory = await ethers.getContractFactory('JBToken');
  return await jbTokenFactory.deploy(name, symbol);
}

/**
 * Get a new date by adding days to now
 * @param {number} days
 * @return {date}
 */
export function daysFromNow(days) {
  let date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Get a new date by adding days to the original date
 * @param {date} date
 * @param {number} days
 * @return {date}
 */
export function daysFromDate(date, days) {
  let newDate = new Date();
  newDate.setDate(date.getDate() + days);
  return newDate;
}

/**
 * Get date in seconds
 * @param {date} date
 * @return {number}
 */
export function dateInSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Returns a mock FundingCyleMetadata packed into a BigNumber
 * @summary Should mirror the bit logic in JBFundingCycleMetadataResolver.sol.
 * @param {custom obj} e.g. packFundingCycleMetadata({ reservedRate: 3500, pausePay: 1 })
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

  let packed = ethers.BigNumber.from(version);
  packed = packed.or(ethers.BigNumber.from(reservedRate).shl(8));
  packed = packed.or(ethers.BigNumber.from(10000 - redemptionRate).shl(24));
  packed = packed.or(ethers.BigNumber.from(10000 - ballotRedemptionRate).shl(40));
  if (pausePay) packed = packed.or(one.shl(56));
  if (pauseDistributions) packed = packed.or(one.shl(57));
  if (pauseRedeem) packed = packed.or(one.shl(58));
  if (pauseMint) packed = packed.or(one.shl(59));
  if (pauseBurn) packed = packed.or(one.shl(60));
  if (allowChangeToken) packed = packed.or(one.shl(61));
  if (allowTerminalMigration) packed = packed.or(one.shl(62));
  if (allowControllerMigration) packed = packed.or(one.shl(63));
  if (holdFees) packed = packed.or(one.shl(64));
  if (useLocalBalanceForRedemptions) packed = packed.or(one.shl(65));
  if (useDataSourceForPay) packed = packed.or(one.shl(66));
  if (useDataSourceForRedeem) packed = packed.or(one.shl(67));
  return packed.or(ethers.BigNumber.from(dataSource).shl(68));
}
