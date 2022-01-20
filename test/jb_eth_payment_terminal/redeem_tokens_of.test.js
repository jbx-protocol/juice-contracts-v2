import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/interfaces/IJBDirectory.sol/IJBDirectory.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/interfaces/IJBOperatorStore.sol/IJBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/interfaces/IJBProjects.sol/IJBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/interfaces/IJBSplitsStore.sol/IJBSplitsStore.json';

describe('JBETHPaymentTerminal::redeemTokensOf(...)', function () {
  const AMOUNT = 50000;
  const FUNDING_CYCLE_NUM = 1;
  const MEMO = 'test memo';
  const PROJECT_ID = 13;
  const WEIGHT = 1000;

  async function setup() {
    const [deployer, beneficiary, holder, otherCaller, terminalOwner] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    const [
      mockJbDirectory,
      mockJbEthPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbEthPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
    ]);

    const jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);
    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });
    await mockJbEthPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    const jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbEthPaymentTerminalStore.address,
        terminalOwner.address,
      );

    /* Lib constants */

    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();
    const REDEEM_PERMISSION_INDEX = await jbOperations.REDEEM();

    /* Common mocks */

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(holder.address, holder.address, PROJECT_ID, REDEEM_PERMISSION_INDEX)
      .returns(true);

    const fundingCycle = {
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: 0,
    };

    return {
      beneficiary,
      holder,
      jbEthPaymentTerminal,
      fundingCycle,
      mockJbEthPaymentTerminalStore,
      mockJbOperatorStore,
      otherCaller,
      timestamp,
    };
  }

  it('Should redeem tokens for overflow and emit event', async function () {
    const {
      beneficiary,
      fundingCycle,
      holder,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      timestamp,
    } = await setup();

    // Keep it simple and let 1 token exchange for 1 wei
    await mockJbEthPaymentTerminalStore.mock.recordRedemptionFor
      .withArgs(
        holder.address,
        PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
        MEMO,
        /* delegateMetadata */ 0,
      )
      .returns(fundingCycle, /* claimAmount */ AMOUNT, MEMO);

    // Give terminal sufficient ETH
    await ethers.provider.send('hardhat_setBalance', [
      jbEthPaymentTerminal.address,
      '0x' + AMOUNT.toString(16),
    ]);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    const tx = await jbEthPaymentTerminal
      .connect(holder)
      .redeemTokensOf(
        holder.address,
        PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
        MEMO,
        /* delegateMetadata */ 0,
      );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'RedeemTokens')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ PROJECT_ID,
        /* _holder */ holder.address,
        /* _beneficiary */ beneficiary.address,
        /* _tokenCount */ AMOUNT,
        /* claimAmount */ AMOUNT,
        /* memo */ MEMO,
        /* msg.sender */ holder.address,
      );

    // Terminal should be out of ETH
    expect(await ethers.provider.getBalance(jbEthPaymentTerminal.address)).to.equal(0);

    // Beneficiary should have a larger balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance.add(AMOUNT),
    );
  });

  it('Should not perform a transfer and only emit events if claim amount is 0', async function () {
    const {
      beneficiary,
      fundingCycle,
      holder,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      timestamp,
    } = await setup();

    // Keep it simple and let 1 token exchange for 1 wei
    await mockJbEthPaymentTerminalStore.mock.recordRedemptionFor
      .withArgs(
        holder.address,
        PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
        MEMO,
        /* delegateMetadata */ 0,
      )
      .returns(fundingCycle, /* claimAmount */ 0, MEMO); // Set claimAmount to 0

    // Give terminal sufficient ETH
    await ethers.provider.send('hardhat_setBalance', [
      jbEthPaymentTerminal.address,
      '0x' + AMOUNT.toString(16),
    ]);

    const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

    const tx = await jbEthPaymentTerminal
      .connect(holder)
      .redeemTokensOf(
        holder.address,
        PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        beneficiary.address,
        MEMO,
        /* delegateMetadata */ 0,
      );

    expect(await tx)
      .to.emit(jbEthPaymentTerminal, 'RedeemTokens')
      .withArgs(
        /* _fundingCycle.configuration */ timestamp,
        /* _fundingCycle.number */ FUNDING_CYCLE_NUM,
        /* _projectId */ PROJECT_ID,
        /* _holder */ holder.address,
        /* _beneficiary */ beneficiary.address,
        /* _tokenCount */ AMOUNT,
        /* claimAmount */ 0,
        /* memo */ MEMO,
        /* msg.sender */ holder.address,
      );

    // Terminal's ETH balance should not have changed
    expect(await ethers.provider.getBalance(jbEthPaymentTerminal.address)).to.equal(AMOUNT);

    // Beneficiary should have the same balance
    expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(
      initialBeneficiaryBalance,
    );
  });

  /* Sad path tests */

  it(`Can't redeem tokens for overflow without access`, async function () {
    const { beneficiary, holder, jbEthPaymentTerminal, mockJbOperatorStore, otherCaller } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);

    await expect(
      jbEthPaymentTerminal
        .connect(otherCaller)
        .redeemTokensOf(
          holder.address,
          PROJECT_ID,
          /* tokenCount */ AMOUNT,
          /* minReturnedWei */ AMOUNT,
          beneficiary.address,
          MEMO,
          /* delegateMetadata */ 0,
        ),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it(`Can't redeem tokens for overflow if beneficiary is zero address`, async function () {
    const { holder, jbEthPaymentTerminal } = await setup();

    await expect(
      jbEthPaymentTerminal.connect(holder).redeemTokensOf(
        holder.address,
        PROJECT_ID,
        /* tokenCount */ AMOUNT,
        /* minReturnedWei */ AMOUNT,
        /* beneficiary */ ethers.constants.AddressZero, // Beneficiary address is 0
        MEMO,
        /* delegateMetadata */ 0,
      ),
    ).to.be.revertedWith(errors.REDEEM_TO_ZERO_ADDRESS);
  });
});
