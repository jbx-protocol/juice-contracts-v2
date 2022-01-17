import { expect } from 'chai';
import { ethers } from 'hardhat';

import { packFundingCycleMetadata } from '../helpers/utils';

describe('JBFundingCycleMetadataResolver::packFundingCycleMetadata(...)', function () {
  async function setup() {
    const [addr] = await ethers.getSigners();

    const factory = await ethers.getContractFactory('JBFakeFundingCycleMetadataResolver');
    const testResolverContract = await factory.deploy();

    return { addr, testResolverContract };
  }

  it('Should pack funding cycle metadata with all flags off', async function () {
    const { addr, testResolverContract } = await setup();

    const fundingCycleMetadata = {
      reservedRate: 10000, // percentage
      redemptionRate: 0, // percentage
      ballotRedemptionRate: 9000, // percentage
      pausePay: false, // boolean
      pauseDistributions: false, // boolean
      pauseRedeem: false, // boolean
      pauseMint: false, // boolean
      pauseBurn: false, // boolean
      allowChangeToken: false, // boolean
      allowTerminalMigration: false, // boolean
      allowControllerMigration: false, // boolean
      holdFees: false, // boolean
      useLocalBalanceForRedemptions: false, // boolean
      useDataSourceForPay: false, // boolean
      useDataSourceForRedeem: false, // boolean
      dataSource: addr.address, // address
    };

    expect(await testResolverContract.packFundingCycleMetadata(fundingCycleMetadata)).to.be.equal(
      packFundingCycleMetadata(fundingCycleMetadata), // Compare with test util's packed result
    );
  });

  it('Should pack funding cycle metadata with all flags on', async function () {
    const { addr, testResolverContract } = await setup();

    const fundingCycleMetadata = {
      reservedRate: 10000, // percentage
      redemptionRate: 0, // percentage
      ballotRedemptionRate: 9000, // percentage
      pausePay: true, // boolean
      pauseDistributions: true, // boolean
      pauseRedeem: true, // boolean
      pauseMint: true, // boolean
      pauseBurn: true, // boolean
      allowChangeToken: true, // boolean
      allowTerminalMigration: true, // boolean
      allowControllerMigration: true, // boolean
      holdFees: true, // boolean
      useLocalBalanceForRedemptions: true, // boolean
      useDataSourceForPay: true, // boolean
      useDataSourceForRedeem: true, // boolean
      dataSource: addr.address, // address
    };

    expect(await testResolverContract.packFundingCycleMetadata(fundingCycleMetadata)).to.be.equal(
      packFundingCycleMetadata(fundingCycleMetadata), // Compare with test util's packed result
    );
  });
});
