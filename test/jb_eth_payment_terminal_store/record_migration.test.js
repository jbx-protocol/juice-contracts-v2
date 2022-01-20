import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata } from '../helpers/utils';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBETHPaymentTerminalStore::recordMigration(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');

  async function setup() {
    const [deployer, terminal] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);

    const jbEthPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'JBETHPaymentTerminalStore',
    );
    const jbEthPaymentTerminalStore = await jbEthPaymentTerminalStoreFactory.deploy(
      mockJbPrices.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
    );

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    return {
      terminal,
      mockJbFundingCycleStore,
      jbEthPaymentTerminalStore,
      timestamp,
    };
  }

  it('Should record migration with terminal access', async function () {
    const { terminal, mockJbFundingCycleStore, jbEthPaymentTerminalStore, timestamp } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowTerminalMigration: 1 }),
    });

    // Add to balance beforehand
    await jbEthPaymentTerminalStore.connect(terminal).recordAddedBalanceFor(PROJECT_ID, AMOUNT);

    // "Record migration"
    await jbEthPaymentTerminalStore.connect(terminal).recordMigration(PROJECT_ID);

    // Current balance should be set to 0
    expect(await jbEthPaymentTerminalStore.balanceOf(PROJECT_ID)).to.equal(0);
  });

  it(`Can't record migration without terminal access`, async function () {
    const { mockJbFundingCycleStore, jbEthPaymentTerminalStore, timestamp } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowTerminalMigration: 0 }),
    });

    // Record migration
    await expect(jbEthPaymentTerminalStore.recordMigration(PROJECT_ID)).to.be.revertedWith(
      errors.UNAUTHORIZED,
    );
  });

  it(`Can't record migration with allowTerminalMigration flag disabled`, async function () {
    const { terminal, mockJbFundingCycleStore, jbEthPaymentTerminalStore, timestamp } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowTerminalMigration: 0 }),
    });

    // Record migration
    await expect(
      jbEthPaymentTerminalStore.connect(terminal).recordMigration(PROJECT_ID),
    ).to.be.revertedWith(errors.PAYMENT_TERMINAL_MIGRATION_NOT_ALLOWED);
  });
});
