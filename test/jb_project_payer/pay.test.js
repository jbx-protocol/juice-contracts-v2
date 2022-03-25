import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPayoutRedemptionPaymentTerminal.sol/IJBPayoutRedemptionPaymentTerminal.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import errors from '../helpers/errors.json';

describe('JBETHERC20ProjectPayer::pay(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = [0x1];
  const PROJECT_ID = 7;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MIN_RETURNED_TOKENS = 1;
  const MEMO = 'hi world';
  const METADATA = [0x2];
  let ethToken;

  this.beforeAll(async function () {
    let jbTokensFactory = await ethers.getContractFactory('JBTokens');
    let jbTokens = await jbTokensFactory.deploy();

    ethToken = await jbTokens.ETH();
  });

  async function setup() {
    let [deployer, owner, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    let mockJbToken = await deployMockContract(deployer, jbToken.abi);

    let jbProjectPayerFactory = await ethers.getContractFactory('JBETHERC20ProjectPayer');
    let jbProjectPayer = await jbProjectPayerFactory.deploy(
      INITIAL_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      mockJbDirectory.address,
      owner.address
    );

    return {
      deployer,
      owner,
      addrs,
      mockJbToken,
      mockJbDirectory,
      mockJbTerminal,
      jbProjectPayer,
    };
  }

  it(`Should pay funds towards project`, async function () {
    const { jbProjectPayer, mockJbDirectory, mockJbTerminal } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        PROJECT_ID,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      ).returns();

    await expect(
      jbProjectPayer.pay(
        PROJECT_ID,
        ethToken,
        0,
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

  it(`Should pay funds towards project with an erc20 tokens`, async function () {
    const { jbProjectPayer, mockJbDirectory, mockJbTerminal, mockJbToken, addrs } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, mockJbToken.address)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        PROJECT_ID,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      ).returns();

    const payer = addrs[0];
    await mockJbToken.mock['transferFrom(address,address,uint256)']
      .withArgs(payer.address, jbProjectPayer.address, AMOUNT)
      .returns(0);
    await mockJbToken.mock['approve(address,uint256)']
      .withArgs(mockJbTerminal.address, AMOUNT)
      .returns(0);
    await expect(
      jbProjectPayer.connect(payer).pay(
        PROJECT_ID,
        mockJbToken.address,
        AMOUNT,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA
      ),
    ).to.not.be.reverted;
  });

  it(`Fallback function should pay funds towards default project`, async function () {
    const { jbProjectPayer, mockJbDirectory, mockJbTerminal, addrs } = await setup();

    let caller = addrs[0];

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(INITIAL_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        INITIAL_PROJECT_ID,
        INITIAL_BENEFICIARY,
        0,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA
      )
      .returns();

    await expect(
      caller.sendTransaction({
        to: jbProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });

  it(`Fallback function should pay funds towards default project with no default beneficiary`, async function () {
    const { jbProjectPayer, mockJbDirectory, mockJbTerminal, owner, addrs } = await setup();

    let caller = addrs[0];

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(INITIAL_PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);

    // Set the default beneficiary to the zero address.

    await jbProjectPayer.connect(owner).setDefaultValues(
      INITIAL_PROJECT_ID,
      ethers.constants.AddressZero,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA
    );

    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT,
        INITIAL_PROJECT_ID,
        addrs[0].address,
        0,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA
      )
      .returns();

    await expect(
      caller.sendTransaction({
        to: jbProjectPayer.address,
        value: AMOUNT,
      }),
    ).to.not.be.reverted;
  });


  it(`Can't pay if terminal not found`, async function () {
    const { jbProjectPayer, mockJbDirectory } = await setup();

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(ethers.constants.AddressZero);

    await expect(
      jbProjectPayer.pay(
        PROJECT_ID,
        ethToken,
        0,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.be.revertedWith(errors.TERMINAL_NOT_FOUND);
  });

  it(`Can't send value along with non-eth token`, async function () {
    const { jbProjectPayer, mockJbDirectory } = await setup();

    await expect(
      jbProjectPayer.pay(
        PROJECT_ID,
        ethers.constants.AddressZero,
        0,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        {
          value: AMOUNT,
        },
      ),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
});
