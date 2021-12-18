import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount, packFundingCycleMetadata } from '../helpers/utils';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBTerminal.sol/IJBTerminal.json';

describe('JBController::mintTokenOf(...)', function () {
  const PROJECT_ID = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';
  const MEMO = 'Test Memo'
  const TOTAL_SUPPLY = 100000;
  const AMOUNT_TO_BURN = 20000;
  const RESERVED_RATE = 5000; // 50%


  let BURN_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    BURN_INDEX = await jbOperations.BURN();
  });

  async function setup() {
    let [deployer, projectOwner, holder, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);
    let mockTokenStore = await deployMockContract(deployer, jbTokenStore.abi);
    let mockSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockToken = await deployMockContract(deployer, jbToken.abi);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockTokenStore.address,
      mockSplitsStore.address
    );

    await mockJbProjects.mock.ownerOf
      .withArgs(PROJECT_ID)
      .returns(projectOwner.address);

    await mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, holder.address)
      .returns(false);

    await mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, projectOwner.address)
      .returns(false);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseBurn: 0, pauseMint: 0, reservedRate: RESERVED_RATE })
    });

    // only non-reserved are minted, minting total supply in holder account
    await mockTokenStore.mock.mintFor
      .withArgs(holder.address, PROJECT_ID, (TOTAL_SUPPLY * (10000 - RESERVED_RATE) / 10000), /*_preferClaimedTokens=*/true)
      .returns();

    await mockTokenStore.mock.burnFrom
      .withArgs(holder.address, PROJECT_ID, AMOUNT_TO_BURN, /*_preferClaimedTokens=*/true)
      .returns();

    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns(TOTAL_SUPPLY * (10000 - RESERVED_RATE) / 10000); // rest is in reserved

    console.log("jbController " + jbController.address);
    console.log("mockTokenStore " + mockTokenStore.address);
    console.log("holder " + holder.address);

    await jbController.connect(projectOwner).mintTokensOf(PROJECT_ID, TOTAL_SUPPLY, holder.address, MEMO, /*_preferClaimedTokens=*/true, RESERVED_RATE);

    return {
      projectOwner,
      holder,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockTokenStore,
      mockToken,
      timestamp
    };
  }

  it.only(`Should burn if caller is token owner and update the reserved token balance of the project accordingly`, async function () {
    const { holder, jbController, mockTokenStore } = await setup();

    let initReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, RESERVED_RATE);
    await expect(
      jbController.connect(holder).burnTokensOf(
        holder.address,
        PROJECT_ID,
        AMOUNT_TO_BURN,
        MEMO,
        /*_preferClaimedTokens=*/true
      )
    ).to.emit(jbController, 'BurnTokens')
      .withArgs(holder.address, PROJECT_ID, AMOUNT_TO_BURN, MEMO, holder.address);

    await mockTokenStore.mock.totalSupplyOf
      .withArgs(PROJECT_ID)
      .returns((TOTAL_SUPPLY * (10000 - RESERVED_RATE) / 10000) - AMOUNT_TO_BURN); // previous total supply minus burned


    // mint 100k with 50% reserve -> _processedTokenTrackerOf(id) = 0, holder balance = 50k, totSup = 50k
    // reservedTokenBalance(id, reservedRate) = _reserveTokenAmountFor(_processedTracker=0, RR=50%, totalSupply=50k)
    // unprocessed = 50k - 0 = 50k -> reservedTokenBalance returns (50k * 10000 / (10000 - 5000)) - 50k = 50k

    // burn 20k from holder (same reserve rate) -> _processedTokenTrackerOf(id) = -20k, holder balance = 30k, totSup = 30k
    // reservedTokenBalance(id, reservedRate) = _reserveTokenAmountFor(_processedTracker=-20, RR=50%, totalSupply=30k)
    // unprocessed = 30k + 20k = 50k -> reservedTokenBalance returns (50k * 10000 / (10000 - 5000)) - 50k = 50k
    // 
    // should 50k -> 50k
    let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, RESERVED_RATE);

    expect(newReservedTokenBalance).to.equal(initReservedTokenBalance);
  });

  it(`Should burn token if caller is not project owner but is authorized`, async function () {
    const { projectOwner, holder, addrs, jbController, mockJbOperatorStore, mockJbDirectory } = await setup();

    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, BURN_INDEX)
      .returns(true);

    await mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, caller.address)
      .returns(false);

    await expect(jbController.connect(caller).mintTokensOf(PROJECT_ID, AMOUNT_TO_BURN, holder.address, MEMO, /*_preferClaimedTokens=*/true, RESERVED_RATE))
      .to.emit(jbController, 'MintTokens')
      .withArgs(holder.address, PROJECT_ID, AMOUNT_TO_BURN, MEMO, RESERVED_RATE, caller.address);

    let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, RESERVED_RATE);
    expect(newReservedTokenBalance).to.equal(AMOUNT_TO_BURN - AMOUNT_TO_BURN);
  });

  it(`Should burn token if caller is a terminal of the corresponding project`, async function () {
    const { projectOwner, holder, jbController, mockJbOperatorStore, mockJbDirectory } = await setup();
    const terminal = await deployMockContract(projectOwner, jbTerminal.abi);
    const terminalSigner = await impersonateAccount(terminal.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(terminalSigner.address, projectOwner.address, PROJECT_ID, BURN_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(terminalSigner.address, projectOwner.address, 0, BURN_INDEX)
      .returns(false);

    await mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, terminalSigner.address)
      .returns(true);

    await expect(jbController.connect(terminalSigner).mintTokensOf(PROJECT_ID, AMOUNT_TO_BURN, holder.address, MEMO, /*_preferClaimedTokens=*/true, RESERVED_RATE))
      .to.emit(jbController, 'MintTokens')
      .withArgs(holder.address, PROJECT_ID, AMOUNT_TO_BURN, MEMO, RESERVED_RATE, terminalSigner.address);

    let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, RESERVED_RATE);
    expect(newReservedTokenBalance).to.equal(AMOUNT_TO_BURN - AMOUNT_TO_BURN);
  });

  it(`Can't burn 0 token`, async function () {
    const { projectOwner, holder, jbController } = await setup();

    await expect(jbController.connect(projectOwner).mintTokensOf(PROJECT_ID, 0, holder.address, MEMO, /*_preferClaimedTokens=*/true, RESERVED_RATE))
      .to.be.revertedWith('0x30: NO_OP');
  });

  it(`Can't burn token if funding cycle is paused and caller is not a terminal delegate`, async function () {
    const { projectOwner, holder, jbController, mockJbFundingCycleStore, timestamp } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseMint: 1, reservedRate: RESERVED_RATE })
    });

    await expect(jbController.connect(projectOwner).mintTokensOf(PROJECT_ID, AMOUNT_TO_BURN, holder.address, MEMO, /*_preferClaimedTokens=*/true, RESERVED_RATE))
      .to.be.revertedWith('0x31: PAUSED');
  });

  it(`Should burn token if funding cycle is paused and caller is a terminal delegate`, async function () {
    const { projectOwner, holder, jbController, mockJbFundingCycleStore, mockJbOperatorStore, mockJbDirectory, timestamp } = await setup();
    const terminal = await deployMockContract(projectOwner, jbTerminal.abi);
    const terminalSigner = await impersonateAccount(terminal.address);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(terminalSigner.address, projectOwner.address, PROJECT_ID, BURN_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(terminalSigner.address, projectOwner.address, 0, BURN_INDEX)
      .returns(false);

    await mockJbDirectory.mock.isTerminalDelegateOf
      .withArgs(PROJECT_ID, terminalSigner.address)
      .returns(true);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock JBFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseMint: 1, reservedRate: RESERVED_RATE })
    });

    await expect(jbController.connect(terminalSigner).mintTokensOf(PROJECT_ID, AMOUNT_TO_BURN, holder.address, MEMO, /*_preferClaimedTokens=*/true, RESERVED_RATE))
      .to.emit(jbController, 'MintTokens')
      .withArgs(holder.address, PROJECT_ID, AMOUNT_TO_BURN, MEMO, RESERVED_RATE, terminalSigner.address);

    let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(PROJECT_ID, RESERVED_RATE);
    expect(newReservedTokenBalance).to.equal(AMOUNT_TO_BURN - AMOUNT_TO_BURN);
  });

});