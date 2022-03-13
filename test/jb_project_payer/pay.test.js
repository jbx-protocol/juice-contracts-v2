import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPaymentTerminal.sol/IJBPaymentTerminal.json';
import errors from '../helpers/errors.json';

describe('JBProjectPayer::pay(...)', function () {
  const PROJECT_ID = 1;
  const PROJECT_ID_2 = 2;
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const TOKEN = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MEMO = 'memo';
  const DELEGATE_METADATA = [0x1];
  const AMOUNT = ethers.utils.parseEther('1.0');

  let JBTOKENS_ETH;

  this.beforeAll(async function () {
    let jbTokensFactory = await ethers.getContractFactory('JBTokens');
    let jbTokens = await jbTokensFactory.deploy();

    JBTOKENS_ETH = await jbTokens.ETH();
  });

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProjectPayer');
    let jbFakeProjectPayer = await jbFakeProjectFactory.deploy(PROJECT_ID, mockJbDirectory.address);

    return {
      deployer,
      addrs,
      mockJbDirectory,
      mockJbTerminal,
      jbFakeProjectPayer,
    };
  }

  it(`Should pay funds towards project`, async function () {
    const { jbFakeProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID_2, TOKEN)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        PROJECT_ID_2,
        BENEFICIARY,
        0,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        DELEGATE_METADATA,
      )
      .returns();

    await expect(
      jbFakeProjectPayer.pay(
        PROJECT_ID_2,
        BENEFICIARY,
        MEMO,
        PREFER_CLAIMED_TOKENS,
        TOKEN,
        DELEGATE_METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.not.be.reverted;
  });

  it(`Fallback function should pay funds towards default project`, async function () {
    const { jbFakeProjectPayer, mockJbDirectory, mockJbTerminal, addrs } = await setup();

    let caller = addrs[0];

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, JBTOKENS_ETH)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        PROJECT_ID,
        caller.address,
        0,
        /*preferClaimedTokens=*/ false,
        /*memo=*/ '',
        [],
      )
      .returns();

    await expect(
      caller.sendTransaction({
        to: jbFakeProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });

  it(`Can't pay with fallback function if there's no default project`, async function () {
    const { jbFakeProjectPayer, deployer, addrs } = await setup();

    let caller = addrs[0];

    await jbFakeProjectPayer.connect(deployer).setDefaultProjectId(0);

    await expect(
      caller.sendTransaction({
        to: jbFakeProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.be.revertedWith(errors.DEFAULT_PROJECT_NOT_FOUND);
  });

  it(`Can't pay if terminal not found`, async function () {
    const { jbFakeProjectPayer, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, TOKEN)
      .returns(ethers.constants.AddressZero);

    await expect(
      jbFakeProjectPayer.pay(
        PROJECT_ID,
        BENEFICIARY,
        MEMO,
        PREFER_CLAIMED_TOKENS,
        TOKEN,
        DELEGATE_METADATA,
      ),
    ).to.be.revertedWith(errors.TERMINAL_NOT_FOUND);
  });
});
