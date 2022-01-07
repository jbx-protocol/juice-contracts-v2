import { expect } from 'chai';
import { ethers } from 'hardhat';

import { packFundingCycleMetadata } from '../helpers/utils';

describe('JBFundingCycleMetadataResolver::getMetadata(...)', function () {
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');

  async function setup() {
    const [addr] = await ethers.getSigners();

    const factory = await ethers.getContractFactory('JBFakeFundingCycleMetadataResolver');
    const testResolverContract = await factory.deploy();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    return { addr, testResolverContract, timestamp };
  }

  function makeFundingCycle(timestamp) {
    return {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: 0,
    };
  }

  it('Should get reservedRate', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = 999;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ reservedRate: value });

    expect(await testResolverContract.reservedRate(fundingCycle)).to.be.equal(value);
  });

  it('Should get redemptionRate', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = 10000;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ redemptionRate: value });

    expect(await testResolverContract.redemptionRate(fundingCycle)).to.be.equal(value);
  });

  it('Should get ballotRedemptionRate', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = 0;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ ballotRedemptionRate: value });

    expect(await testResolverContract.ballotRedemptionRate(fundingCycle)).to.be.equal(value);
  });

  it('Should get payPaused flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ pausePay: value });

    expect(await testResolverContract.payPaused(fundingCycle)).to.be.equal(value);
  });

  it('Should get distributionsPaused flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ pauseDistributions: value });

    expect(await testResolverContract.distributionsPaused(fundingCycle)).to.be.equal(value);
  });

  it('Should get redeemPaused flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ pauseRedeem: value });

    expect(await testResolverContract.redeemPaused(fundingCycle)).to.be.equal(value);
  });

  it('Should get mintPaused flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ pauseMint: value });

    expect(await testResolverContract.mintPaused(fundingCycle)).to.be.equal(value);
  });

  it('Should get burnPaused flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ pauseBurn: value });

    expect(await testResolverContract.burnPaused(fundingCycle)).to.be.equal(value);
  });

  it('Should get changeTokenAllowed flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ allowChangeToken: value });

    expect(await testResolverContract.changeTokenAllowed(fundingCycle)).to.be.equal(value);
  });

  it('Should get terminalMigrationAllowed flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ allowTerminalMigration: value });

    expect(await testResolverContract.terminalMigrationAllowed(fundingCycle)).to.be.equal(value);
  });

  it('Should get controllerMigrationAllowed flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ allowControllerMigration: value });

    expect(await testResolverContract.controllerMigrationAllowed(fundingCycle)).to.be.equal(value);
  });

  it('Should get shouldHoldFees flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ holdFees: value });

    expect(await testResolverContract.shouldHoldFees(fundingCycle)).to.be.equal(value);
  });

  it('Should get shouldUseLocalBalanceForRedemptions flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = false;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ useLocalBalanceForRedemptions: value });

    expect(
      await testResolverContract.shouldUseLocalBalanceForRedemptions(fundingCycle),
    ).to.be.equal(value);
  });

  it('Should get useDataSourceForPay flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ useDataSourceForPay: value });

    expect(await testResolverContract.useDataSourceForPay(fundingCycle)).to.be.equal(value);
  });

  it('Should get useDataSourceForRedeem flag', async function () {
    const { testResolverContract, timestamp } = await setup();

    const value = true;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ useDataSourceForRedeem: value });

    expect(await testResolverContract.useDataSourceForRedeem(fundingCycle)).to.be.equal(value);
  });

  it('Should get data source', async function () {
    const { addr, testResolverContract, timestamp } = await setup();

    const value = addr.address;
    let fundingCycle = makeFundingCycle(timestamp);
    fundingCycle.metadata = packFundingCycleMetadata({ dataSource: value });

    expect(await testResolverContract.dataSource(fundingCycle)).to.be.equal(value);
  });
});
