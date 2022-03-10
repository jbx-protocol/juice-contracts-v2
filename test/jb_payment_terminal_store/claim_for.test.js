import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

import errors from '../helpers/errors.json';

describe('JBPaymentTerminalStore::claimFor(...)', function () {
  const CURRENCY = 1;
  const BASE_CURRENCY = 0;

  async function setup() {
    const [deployer] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, jbPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi)
    const mockJbTokenStore = await deployMockContract(deployer, jbTokenStore.abi);

    const JBPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'JBPaymentTerminalStore',
    );
    const JBPaymentTerminalStore = await JBPaymentTerminalStoreFactory.deploy(
      mockJbPrices.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
    );

    await mockJbTerminal.mock.currency.returns(CURRENCY);
    await mockJbTerminal.mock.baseWeightCurrency.returns(BASE_CURRENCY);

    return {
      mockJbTerminal,
      JBPaymentTerminalStore,
    };
  }

  it('Should set terminal', async function () {
    const { mockJbTerminal, JBPaymentTerminalStore } = await setup();

    // Set terminal address
    await JBPaymentTerminalStore.claimFor(mockJbTerminal.address);

    expect(await JBPaymentTerminalStore.terminal()).to.equal(mockJbTerminal.address);
  });

  it(`Can't set terminal if already claimed`, async function () {
    const { mockJbTerminal, JBPaymentTerminalStore } = await setup();

    // Set terminal address
    await JBPaymentTerminalStore.claimFor(mockJbTerminal.address);

    // Set terminal address again
    await expect(JBPaymentTerminalStore.claimFor(mockJbTerminal.address)).to.be.revertedWith(
      errors.STORE_ALREADY_CLAIMED,
    );
  });
});
