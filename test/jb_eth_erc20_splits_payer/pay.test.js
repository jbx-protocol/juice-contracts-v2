import { ethers } from 'hardhat';
import { expect } from 'chai';
import { makeSplits } from '../helpers/utils.js';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbAllocator from '../../artifacts/contracts/interfaces/IJBSplitAllocator.sol/IJBSplitAllocator.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPayoutRedemptionPaymentTerminal.sol/IJBPayoutRedemptionPaymentTerminal.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import errors from '../helpers/errors.json';

describe('JBETHERC20SplitsPayer::pay(...)', function () {
  const PROTOCOL_PROJECT_ID = 1;
  const SPLITS_GROUP = 1;
  const AMOUNT = ethers.utils.parseEther('1.0');
  const DEFAULT_DECIMALS = 18;

  const PROJECT_ID = 69;

  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = [0x1];


  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MIN_RETURNED_TOKENS = 1;
  const MEMO = 'hi world';
  const METADATA = [0x2];
  const DECIMALS = 1;
  let ethToken;
  let maxSplitsPercent;

  this.beforeAll(async function () {
    let jbTokensFactory = await ethers.getContractFactory('JBTokens');
    let jbTokens = await jbTokensFactory.deploy();

    ethToken = await jbTokens.ETH();

    let jbConstantsFactory = await ethers.getContractFactory('JBConstants');
    let jbConstants = await jbConstantsFactory.deploy();

    maxSplitsPercent = await jbConstants.SPLITS_TOTAL_PERCENT();
  });

  async function setup() {
    let [deployer, owner, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    let mockJbToken = await deployMockContract(deployer, jbToken.abi);
    
    const splits = makeSplits();
    const groupedSplits = { group: SPLITS_GROUP, splits };

    let jbSplitsPayerFactory = await ethers.getContractFactory('JBETHERC20SplitsPayer');
    
    const transactionCount = await deployer.getTransactionCount()
    const jbSplitsPayerAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: transactionCount + 1
    })
    await mockJbSplitsStore.mock.set.withArgs(1, jbSplitsPayerAddress, 1, splits).returns();

    let jbSplitsPayer = await jbSplitsPayerFactory.deploy(
      groupedSplits,
      mockJbSplitsStore.address, 
      PROTOCOL_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      mockJbDirectory.address,
      owner.address,
      );
      
    return {
      deployer,
      owner,
      addrs,
      mockJbToken,
      mockJbDirectory,
      mockJbTerminal,
      mockJbSplitsStore,
      jbSplitsPayer,
    };
  }

  it(`Should send funds towards allocator if set in split`, async function () {
    const { deployer, jbSplitsPayer, mockJbSplitsStore } = await setup();

    let mockJbAllocator = await deployMockContract(deployer, jbAllocator.abi);

    let splits = makeSplits({ allocator: mockJbAllocator.address });

    await Promise.all(
      splits.map(async split => {
        await mockJbAllocator.mock.allocate
          .withArgs(
            {
              amount: AMOUNT.mul(split.percent).div(maxSplitsPercent),
              decimals: DEFAULT_DECIMALS,
              projectId: PROTOCOL_PROJECT_ID,
              group: 0,
              split: split
            }
          )
          .returns();
      })
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROTOCOL_PROJECT_ID, jbSplitsPayer.address, SPLITS_GROUP)
      .returns(splits);
    
    await expect(
      jbSplitsPayer.pay(
        PROTOCOL_PROJECT_ID,
        ethToken,
        AMOUNT,
        DEFAULT_DECIMALS,
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

  it(`Should pay funds towards project terminal if project ID set, and add to balance if no beneficiary is set`, async function () {
    const { jbSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } = await setup();

    let splits = makeSplits({ projectId: PROJECT_ID });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);
    
    await mockJbTerminal.mock.decimals.returns(18);

    await Promise.all(
      splits.map(async split => {
        await mockJbTerminal.mock.addToBalanceOf
          .withArgs(
            split.projectId,
            AMOUNT.mul(split.percent).div(maxSplitsPercent),
            INITIAL_MEMO,
          )
          .returns();
      })
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROTOCOL_PROJECT_ID, jbSplitsPayer.address, SPLITS_GROUP)
      .returns(splits);
    
    await expect(
      jbSplitsPayer.pay(
        PROTOCOL_PROJECT_ID,
        ethToken,
        AMOUNT,
        DEFAULT_DECIMALS,
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

  it(`Should pay funds towards project terminal if project ID set, and pay to the beneficiaries via the project terminal`, async function () {
    const { jbSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } = await setup();

    let beneficiaryOne = ethers.Wallet.createRandom();
    let beneficiaryTwo = ethers.Wallet.createRandom();

    let splits = makeSplits({ count: 2, projectId: PROJECT_ID, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROJECT_ID, ethToken)
      .returns(mockJbTerminal.address);
    
    await mockJbTerminal.mock.decimals.returns(18);

    await Promise.all(
      splits.map(async split => {
        await mockJbTerminal.mock.pay
          .withArgs(
            AMOUNT.mul(split.percent).div(maxSplitsPercent),
            split.projectId,
            split.beneficiary,
            0, /*hardcoded*/
            split.preferClaimed,
            INITIAL_MEMO,
            INITIAL_METADATA
          )
          .returns(0); // Not used
      })
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROTOCOL_PROJECT_ID, jbSplitsPayer.address, SPLITS_GROUP)
      .returns(splits);
    
    await expect(
      jbSplitsPayer.pay(
        PROTOCOL_PROJECT_ID,
        ethToken,
        AMOUNT,
        DEFAULT_DECIMALS,
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

});
