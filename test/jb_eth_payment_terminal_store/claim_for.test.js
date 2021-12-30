import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/IJBFundingCycleStore.sol/IJBFundingCycleStore.json';
import jbPrices from '../../artifacts/contracts/interfaces/IJBPrices.sol/IJBPrices.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbTokenStore from '../../artifacts/contracts/interfaces/IJBTokenStore.sol/IJBTokenStore.json';

describe('JBETHPaymentTerminalStore::claimFor(...)', function () {
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

    return {
      terminal,
      jbEthPaymentTerminalStore,
    };
  }

  it('Should set terminal', async function () {
    const { terminal, jbEthPaymentTerminalStore } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    expect(await jbEthPaymentTerminalStore.terminal()).to.equal(terminal.address);
  });

  it(`Can't set terminal if already claimed`, async function () {
    const { terminal, jbEthPaymentTerminalStore } = await setup();

    // Set terminal address
    await jbEthPaymentTerminalStore.claimFor(terminal.address);

    // Set terminal address again
    await expect(jbEthPaymentTerminalStore.claimFor(terminal.address)).to.be.revertedWith(
      '0x4b: ALREADY_CLAIMED',
    );
  });
});
