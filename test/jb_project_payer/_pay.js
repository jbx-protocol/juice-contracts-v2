import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPaymentTerminal.sol/IJBPaymentTerminal.json';
import errors from '../helpers/errors.json';

// NOTE: `fundTreasury()` is not a public API. The example Juicebox project has a `mint()` function that calls this internally.
describe.only('JBProjectPayer::fundTreasury(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = [0x1];
  const MISC_PROJECT_ID = 7;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MIN_RETURNED_TOKENS = 1;
  const MEMO = 'hi world';
  const METADATA = [0x2];
  let ETH_TOKEN;

  async function setup() {
    let [deployer, owner, ...addrs] = await ethers.getSigners();
    owner;
    let jbTokenFactory = await ethers.getContractFactory('JBTokens');
    let jbToken = await jbTokenFactory.deploy();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);

    ETH_TOKEN = jbToken.ETH;

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProjectPayer');
    let jbFakeProjectPayer = await jbFakeProjectFactory.deploy(
      INITIAL_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      mockJbDirectory.address,
      owner
    );

    return {
      deployer,
      owner,
      addrs,
      mockJbDirectory,
      mockJbTerminal,
      jbFakeProjectPayer,
    };
  }

  it.only(`Should fund project treasury`, async function () {
    const { jbFakeProjectPayer, addrs, mockJbDirectory, mockJbTerminal, owner } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        MISC_PROJECT_ID,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      )
      .returns();

    await expect(
      jbFakeProjectPayer
        .connect(addrs[0])
        .mint(
          MISC_PROJECT_ID,
          ETH_TOKEN,
          AMOUNT,
          BENEFICIARY,
          MIN_RETURNED_TOKENS,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          {
            value: AMOUNT,
          },
        ),
    ).to.not.be.reverted;
  });

  it(`Can't fund if terminal not found`, async function () {
    const { jbFakeProjectPayer, addrs, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(ethers.constants.AddressZero);

    await expect(
      jbFakeProjectPayer
        .connect(addrs[0])
        .mint(
          MISC_PROJECT_ID,
          AMOUNT,
          BENEFICIARY,
          MEMO,
          PREFER_CLAIMED_TOKENS,
          TOKEN,
          METADATA,
        ),
    ).to.be.revertedWith(errors.TERMINAL_NOT_FOUND);
  });

  it(`Can't fund if insufficient funds`, async function () {
    const { jbFakeProjectPayer, addrs, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(MISC_PROJECT_ID, TOKEN)
      .returns(ethers.Wallet.createRandom().address);

    // No funds have been sent to the contract so this should fail.
    await expect(
      jbFakeProjectPayer
        .connect(addrs[0])
        .mint(
          MISC_PROJECT_ID,
          AMOUNT,
          BENEFICIARY,
          MEMO,
          PREFER_CLAIMED_TOKENS,
          TOKEN,
          METADATA,
        ),
    ).to.be.revertedWith(errors.INSUFFICIENT_BALANCE);
  });
});
