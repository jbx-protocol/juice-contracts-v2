import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount, packFundingCycleMetadata } from '../helpers/utils';
import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatorStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbTerminal from '../../artifacts/contracts/abstract/JBPayoutRedemptionPaymentTerminal.sol/JBPayoutRedemptionPaymentTerminal.json';
import jbToken721 from '../../artifacts/contracts/JBToken721.sol/JBToken721.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';
import jbToken721Store from '../../artifacts/contracts/JBToken721Store.sol/JBToken721Store.json';

describe('JBController::mintTokens721Of(...)', function () {
  const PROJECT_ID = 1;
  const MEMO = 'Test Memo';
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  let MINT_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    MINT_INDEX = await jbOperations.MINT();
  });

  async function setup() {
    let [deployer, projectOwner, beneficiary, mockDatasource, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken721,
      mockJbTokenStore,
      mockJbToken721Store,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbFundingCycleStore.abi),
      deployMockContract(deployer, jbOperatorStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken721.abi),
      deployMockContract(deployer, jbTokenStore.abi),
      deployMockContract(deployer, jbToken721Store.abi),
    ]);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
      mockJbToken721Store.address
    );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, projectOwner.address)
      .returns(false);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowMinting: 1, reservedRate: 5000 }),
    });

    await mockJbToken721Store.mock.mintFor.withArgs(beneficiary.address, PROJECT_ID).returns(0);

    await mockJbToken721Store.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(1);

    return {
      projectOwner,
      beneficiary,
      mockDatasource,
      addrs,
      jbController,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbToken721Store,
      mockJbToken721,
      timestamp,
    };
  }

  it(`Should mint token if caller is project owner and funding cycle not paused`, async function () {
    const { projectOwner, beneficiary, jbController } = await setup();
    const tokenId = 0;

    await expect(jbController.connect(projectOwner).mintTokens721Of(PROJECT_ID, beneficiary.address, MEMO))
      .to.emit(jbController, 'MintTokens721').withArgs(beneficiary.address, PROJECT_ID, tokenId, MEMO, projectOwner.address);
  });

  it(`Should mint token if caller is not project owner but is authorized`, async function () {
    const { projectOwner, beneficiary, addrs, jbController, mockJbOperatorStore, mockJbDirectory } = await setup();
    let caller = addrs[0];
    const tokenId = 0;

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MINT_INDEX)
      .returns(true);

    await mockJbDirectory.mock.isTerminalOf.withArgs(PROJECT_ID, caller.address).returns(false);

    await expect(jbController.connect(caller).mintTokens721Of(PROJECT_ID, beneficiary.address, MEMO))
      .to.emit(jbController, 'MintTokens721').withArgs(beneficiary.address, PROJECT_ID, tokenId, MEMO, caller.address);
  });

  it(`Should mint token if caller is a terminal of the corresponding project`, async function () {
    const { projectOwner, beneficiary, jbController, mockJbOperatorStore, mockJbDirectory } = await setup();
    const terminal = await deployMockContract(projectOwner, jbTerminal.abi);
    const terminalSigner = await impersonateAccount(terminal.address);
    const tokenId = 0;

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(terminalSigner.address, projectOwner.address, PROJECT_ID, MINT_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(terminalSigner.address, projectOwner.address, 0, MINT_INDEX)
      .returns(false);

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, terminalSigner.address)
      .returns(true);

    await expect(jbController.connect(terminalSigner).mintTokens721Of(PROJECT_ID, beneficiary.address, MEMO))
      .to.emit(jbController, 'MintTokens721')
      .withArgs(beneficiary.address, PROJECT_ID, tokenId, MEMO, terminalSigner.address);
  });

  // it(`Should mint token if caller is the current funding cycle's datasource of the corresponding project`, async function () {
  //   const {
  //     projectOwner,
  //     beneficiary,
  //     mockDatasource,
  //     jbController,
  //     mockJbFundingCycleStore,
  //     mockJbOperatorStore,
  //     mockJbDirectory,
  //     timestamp,
  //   } = await setup();
  //   const terminal = await deployMockContract(projectOwner, jbTerminal.abi);
  //   const terminalSigner = await impersonateAccount(terminal.address);

  //   await mockJbOperatorStore.mock.hasPermission
  //     .withArgs(terminalSigner.address, projectOwner.address, PROJECT_ID, MINT_INDEX)
  //     .returns(false);

  //   await mockJbOperatorStore.mock.hasPermission
  //     .withArgs(terminalSigner.address, projectOwner.address, 0, MINT_INDEX)
  //     .returns(false);

  //   await mockJbDirectory.mock.isTerminalOf
  //     .withArgs(PROJECT_ID, mockDatasource.address)
  //     .returns(false);

  //   await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
  //     // mock JBFundingCycle obj
  //     number: 1,
  //     configuration: timestamp,
  //     basedOn: timestamp,
  //     start: timestamp,
  //     duration: 0,
  //     weight: 0,
  //     discountRate: 0,
  //     ballot: ethers.constants.AddressZero,
  //     metadata: packFundingCycleMetadata({
  //       allowMinting: 1,
  //       reservedRate: RESERVED_RATE,
  //       dataSource: mockDatasource.address,
  //     }),
  //   });

  //   await expect(
  //     jbController
  //       .connect(mockDatasource)
  //       .mintTokensOf(
  //         PROJECT_ID,
  //         AMOUNT_TO_MINT,
  //         beneficiary.address,
  //         MEMO,
  //         /*_preferClaimedTokens=*/ true,
  //         /* _useReservedRate=*/ true,
  //       ),
  //   )
  //     .to.emit(jbController, 'MintTokens')
  //     .withArgs(
  //       beneficiary.address,
  //       PROJECT_ID,
  //       AMOUNT_TO_MINT,
  //       AMOUNT_TO_RECEIVE,
  //       MEMO,
  //       RESERVED_RATE,
  //       mockDatasource.address,
  //     );

  //   let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(
  //     PROJECT_ID,
  //     RESERVED_RATE,
  //   );
  //   expect(newReservedTokenBalance).to.equal(AMOUNT_TO_MINT - AMOUNT_TO_RECEIVE);
  // });

  it(`Can't mint token if caller is not authorized`, async function () {
    const { projectOwner, beneficiary, addrs, jbController, mockJbOperatorStore, mockJbDirectory } =
      await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MINT_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, MINT_INDEX)
      .returns(false);

    await mockJbDirectory.mock.isTerminalOf.withArgs(PROJECT_ID, caller.address).returns(false);

    await expect(jbController.connect(caller).mintTokens721Of(PROJECT_ID, beneficiary.address, MEMO))
      .to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it(`Can't mint token if funding cycle is paused and caller is not a terminal delegate or a datasource`, async function () {
    const { projectOwner, beneficiary, jbController, mockJbFundingCycleStore, timestamp } =
      await setup();

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
      metadata: packFundingCycleMetadata({ allowMinting: 0, reservedRate: 5000 }),
    });

    await expect(jbController.connect(projectOwner).mintTokens721Of(PROJECT_ID, beneficiary.address, MEMO))
      .to.be.revertedWith(errors.MINT_NOT_ALLOWED_AND_NOT_TERMINAL_DELEGATE);
  });

  // it(`Should mint token if funding cycle is paused and caller is a terminal delegate`, async function () {
  //   const {
  //     projectOwner,
  //     beneficiary,
  //     jbController,
  //     mockJbFundingCycleStore,
  //     mockJbOperatorStore,
  //     mockJbDirectory,
  //     timestamp,
  //   } = await setup();
  //   const terminal = await deployMockContract(projectOwner, jbTerminal.abi);
  //   const terminalSigner = await impersonateAccount(terminal.address);

  //   await mockJbOperatorStore.mock.hasPermission
  //     .withArgs(terminalSigner.address, projectOwner.address, PROJECT_ID, MINT_INDEX)
  //     .returns(false);

  //   await mockJbOperatorStore.mock.hasPermission
  //     .withArgs(terminalSigner.address, projectOwner.address, 0, MINT_INDEX)
  //     .returns(false);

  //   await mockJbDirectory.mock.isTerminalOf
  //     .withArgs(PROJECT_ID, terminalSigner.address)
  //     .returns(true);

  //   await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
  //     // mock JBFundingCycle obj
  //     number: 1,
  //     configuration: timestamp,
  //     basedOn: timestamp,
  //     start: timestamp,
  //     duration: 0,
  //     weight: 0,
  //     discountRate: 0,
  //     ballot: ethers.constants.AddressZero,
  //     metadata: packFundingCycleMetadata({ allowMinting: 0, reservedRate: RESERVED_RATE }),
  //   });

  //   await expect(
  //     jbController
  //       .connect(terminalSigner)
  //       .mintTokensOf(
  //         PROJECT_ID,
  //         AMOUNT_TO_MINT,
  //         beneficiary.address,
  //         MEMO,
  //         /*_preferClaimedTokens=*/ true,
  //         /* _useReservedRate=*/ true,
  //       ),
  //   )
  //     .to.emit(jbController, 'MintTokens')
  //     .withArgs(
  //       beneficiary.address,
  //       PROJECT_ID,
  //       AMOUNT_TO_MINT,
  //       AMOUNT_TO_RECEIVE,
  //       MEMO,
  //       RESERVED_RATE,
  //       terminalSigner.address,
  //     );

  //   let newReservedTokenBalance = await jbController.reservedTokenBalanceOf(
  //     PROJECT_ID,
  //     RESERVED_RATE,
  //   );
  //   expect(newReservedTokenBalance).to.equal(AMOUNT_TO_MINT - AMOUNT_TO_RECEIVE);
  // });
});
