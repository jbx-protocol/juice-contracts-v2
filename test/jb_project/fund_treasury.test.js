import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBProject::fundTreasury(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const MISC_PROJECT_ID = 7;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const MEMO = 'hello world';
  const PREFER_CLAIMED_TOKENS = true;
  const TOKEN = ethers.Wallet.createRandom().address;
  const TERMINAL = ethers.Wallet.createRandom().address;

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProject');
    let jbFakeProject = await jbFakeProjectFactory.deploy(
      INITIAL_PROJECT_ID,
      mockJbDirectory.address,
    );

    return {
      deployer,
      addrs,
      mockJbDirectory,
      jbFakeProject,
    };
  }

  it(`Should fund project treasury`, async function () {
    // TODO(odd-amphora): implement.
  });

  it(`Can't fund if project not found`, async function () {
    const { jbFakeProject, addrs } = await setup();

    await expect(
      jbFakeProject
        .connect(addrs[0])
        .fundTreasury(/*projectId=*/ 0, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN),
    ).to.be.revertedWith('0x01: PROJECT_NOT_FOUND');
  });

  it(`Can't fund if terminal not found`, async function () {
    const { jbFakeProject, addrs, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(ethers.constants.AddressZero);

    await expect(
      jbFakeProject
        .connect(addrs[0])
        .fundTreasury(MISC_PROJECT_ID, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN),
    ).to.be.revertedWith('0x02: TERMINAL_NOT_FOUND');
  });

  it(`Can't fund if insufficient funds`, async function () {
    const { jbFakeProject, addrs, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf.withArgs(MISC_PROJECT_ID, TOKEN).returns(TERMINAL);

    // No funds have been sent to the contract so this should fail.
    await expect(
      jbFakeProject
        .connect(addrs[0])
        .fundTreasury(MISC_PROJECT_ID, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN),
    ).to.be.revertedWith('0x03: INSUFFICIENT_FUNDS');
  });
});
