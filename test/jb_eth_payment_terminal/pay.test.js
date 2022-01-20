import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../helpers/utils.js';
import errors from '../helpers/errors.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';

describe('JBETHPaymentTerminal::pay(...)', function () {
  const PROJECT_ID = 1;
  const MEMO = 'Memo Test';
  const DELEGATE_METADATA = ethers.utils.randomBytes(32);
  const FUNDING_CYCLE_NUMBER = 1;
  const WEIGHT = 10;
  const MIN_TOKEN_REQUESTED = 90;
  const TOKEN_RECEIVED = 100;
  const ETH_TO_PAY = ethers.utils.parseEther('1');

  async function setup() {
    let [deployer, terminalOwner, caller, beneficiary, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
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

    let jbTerminalFactory = await ethers.getContractFactory('JBETHPaymentTerminal', deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: currentNonce + 1,
    });

    await mockJbEthPaymentTerminalStore.mock.claimFor.withArgs(futureTerminalAddress).returns();

    let jbEthPaymentTerminal = await jbTerminalFactory
      .connect(deployer)
      .deploy(
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbEthPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockJbEthPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        caller.address,
        ETH_TO_PAY,
        PROJECT_ID,
        //preferedCLaimed | uint160(beneficiary)<<1
        ethers.BigNumber.from(1).or(ethers.BigNumber.from(caller.address).shl(1)),
        MIN_TOKEN_REQUESTED,
        MEMO,
        DELEGATE_METADATA,
      )
      .returns(
        {
          // mock JBFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        WEIGHT,
        TOKEN_RECEIVED,
        MEMO,
      );

    return {
      terminalOwner,
      caller,
      beneficiary,
      addrs,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      timestamp,
    };
  }

  it('Should record payment and emit event', async function () {
    const { caller, jbEthPaymentTerminal, timestamp } = await setup();

    expect(
      await jbEthPaymentTerminal
        .connect(caller)
        .pay(
          PROJECT_ID,
          caller.address,
          MIN_TOKEN_REQUESTED,
          /*preferClaimedToken=*/ true,
          MEMO,
          DELEGATE_METADATA,
          { value: ETH_TO_PAY },
        ),
    )
      .to.emit(jbEthPaymentTerminal, 'Pay')
      .withArgs(
        /*fundingCycle.configuration=*/ timestamp,
        FUNDING_CYCLE_NUMBER,
        PROJECT_ID,
        caller.address,
        ETH_TO_PAY,
        WEIGHT,
        TOKEN_RECEIVED,
        MEMO,
        caller.address,
      );
  });

  it("Can't send tokens to the zero address", async function () {
    const { caller, jbEthPaymentTerminal } = await setup();

    await expect(
      jbEthPaymentTerminal
        .connect(caller)
        .pay(
          PROJECT_ID,
          ethers.constants.AddressZero,
          MIN_TOKEN_REQUESTED,
          /*preferClaimedToken=*/ true,
          MEMO,
          DELEGATE_METADATA,
          { value: ETH_TO_PAY },
        ),
    ).to.be.revertedWith(errors.PAY_TO_ZERO_ADDRESS);
  });
});
