import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';
import errors from "../helpers/errors.json"

// NOTE: `fundTreasury()` is not a public API. The example Juicebox project has a `mint()` function that calls this internally.
describe('JBProject::fundTreasury(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const MISC_PROJECT_ID = 7;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const MEMO = 'hello world';
  const PREFER_CLAIMED_TOKENS = true;
  const TOKEN = ethers.Wallet.createRandom().address;

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProject');
    let jbFakeProject = await jbFakeProjectFactory.deploy(
      INITIAL_PROJECT_ID,
      mockJbDirectory.address,
    );

    return {
      deployer,
      addrs,
      mockJbDirectory,
      mockJbTerminal,
      jbFakeProject,
    };
  }

  it(`Should fund project treasury`, async function () {
    const { jbFakeProject, addrs, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(MISC_PROJECT_ID, BENEFICIARY, 0, PREFER_CLAIMED_TOKENS, MEMO, [])
      .returns();

    await expect(
      jbFakeProject
        .connect(addrs[0])
        .mint(MISC_PROJECT_ID, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN, {
          value: AMOUNT,
        }),
    ).to.not.be.reverted;
  });

  it(`Can't fund if project not found`, async function () {
    const { jbFakeProject, addrs } = await setup();

    await expect(
      jbFakeProject
        .connect(addrs[0])
        .mint(/*projectId=*/ 0, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN),
    ).to.be.revertedWith(errors.PROJECT_NOT_FOUND);
  });

  it(`Can't fund if terminal not found`, async function () {
    const { jbFakeProject, addrs, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(ethers.constants.AddressZero);

    await expect(
      jbFakeProject
        .connect(addrs[0])
        .mint(MISC_PROJECT_ID, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN),
    ).to.be.revertedWith(errors.TERMINAL_NOT_FOUND);
  });

  it(`Can't fund if insufficient funds`, async function () {
    const { jbFakeProject, addrs, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(ethers.Wallet.createRandom().address);

    // No funds have been sent to the contract so this should fail.
    await expect(
      jbFakeProject
        .connect(addrs[0])
        .mint(MISC_PROJECT_ID, AMOUNT, BENEFICIARY, MEMO, PREFER_CLAIMED_TOKENS, TOKEN),
    ).to.be.revertedWith(errors.INSUFFICIENT_FUNDS);
  });
});
