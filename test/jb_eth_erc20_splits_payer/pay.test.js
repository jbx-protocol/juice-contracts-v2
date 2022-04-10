import { ethers } from 'hardhat';
import { expect } from 'chai';
import { makeSplits } from '../helpers/utils.js';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import ierc20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import jbAllocator from '../../artifacts/contracts/interfaces/IJBSplitAllocator.sol/IJBSplitAllocator.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPayoutRedemptionPaymentTerminal.sol/IJBPayoutRedemptionPaymentTerminal.json';

describe.only('JBETHERC20SplitsPayer::pay(...)', function () {
  const DEFAULT_PROJECT_ID = 2;
  const SPLITS_GROUP = 1;
  const AMOUNT = ethers.utils.parseEther('1.0');

  const DEFAULT_SPLITS_PROJECT_ID = 3;
  const DEFAULT_SPLITS_DOMAIN = 1;
  const DEFAULT_SPLITS_GROUP = 1;
  const DEFAULT_DECIMALS = 18;
  const PREFER_ADD_TO_BALANCE = false;

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
    let [deployer, owner, caller, beneficiaryOne, beneficiaryTwo, beneficiaryThree, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    let mockToken = await deployMockContract(deployer, ierc20.abi);
    
    const splits = makeSplits();
    const groupedSplits = { group: SPLITS_GROUP, splits };

    let jbSplitsPayerFactory = await ethers.getContractFactory('JBETHERC20SplitsPayer');
    
    const transactionCount = await deployer.getTransactionCount()
    const jbSplitsPayerAddress = ethers.utils.getContractAddress({
      from: deployer.address,
      nonce: transactionCount + 1
    })
    //await mockJbSplitsStore.mock.set.withArgs(1, jbSplitsPayerAddress, 1, splits).returns();
    
    await mockJbSplitsStore.mock.directory.returns(mockJbDirectory.address);

    let jbSplitsPayer = await jbSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address, 
      DEFAULT_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      PREFER_ADD_TO_BALANCE,
      owner.address,
      );

    let jbSplitsPayerPreferAddToBalance = await jbSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address, 
      DEFAULT_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      PREFER_ADD_TO_BALANCE,
      owner.address,
    );
      
    return {
      beneficiaryOne,
      beneficiaryTwo,
      beneficiaryThree,
      deployer,
      caller,
      owner,
      addrs,
      mockToken,
      mockJbDirectory,
      mockJbTerminal,
      mockJbSplitsStore,
      jbSplitsPayer,
      jbSplitsPayerPreferAddToBalance
    };
  }

  it(`Should send ETH towards allocator if set in split`, async function () {
    const { deployer, owner, jbSplitsPayer, mockJbSplitsStore } = await setup();

    let mockJbAllocator = await deployMockContract(deployer, jbAllocator.abi);

    let splits = makeSplits({ projectId: PROJECT_ID, allocator: mockJbAllocator.address });

    await Promise.all(
      splits.map(async split => {
        await mockJbAllocator.mock.allocate
          .withArgs(
            {
              amount: AMOUNT.mul(split.percent).div(maxSplitsPercent),
              decimals: 18,
              projectId: DEFAULT_PROJECT_ID,
              group: 0,
              split: split
            }
          )
          .returns();
      })
    );

    // Payment routing
    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);

    await expect(
      jbSplitsPayer
      .connect(owner)
      .pay(
        DEFAULT_PROJECT_ID,
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

  it(`Should send ERC20 with 9-decimals towards allocator if set in split`, async function () {
    const { caller, deployer, jbSplitsPayer, mockToken, mockJbSplitsStore } = await setup();
    const DECIMALS = 9;

    let mockJbAllocator = await deployMockContract(deployer, jbAllocator.abi);

    let splits = makeSplits({ projectId: PROJECT_ID, allocator: mockJbAllocator.address });

    await Promise.all(
      splits.map(async split => {
        await mockToken.mock.approve
          .withArgs(mockJbAllocator.address, AMOUNT.mul(split.percent).div(maxSplitsPercent))
          .returns(true);

        await mockJbAllocator.mock.allocate
          .withArgs(
            {
              amount: AMOUNT.mul(split.percent).div(maxSplitsPercent),
              decimals: DECIMALS,
              projectId: DEFAULT_PROJECT_ID,
              group: 0,
              split: split
            }
          )
          .returns();
      })
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    await mockToken.mock.transferFrom
      .withArgs(caller.address, jbSplitsPayer.address, AMOUNT)
      .returns(true);
    
    await expect(
      jbSplitsPayer
        .connect(caller)
        .pay(
        DEFAULT_PROJECT_ID,
        mockToken.address,
        AMOUNT,
        DECIMALS,
        BENEFICIARY,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
      ),
    ).to.not.be.reverted;
  });

  it(`Should send fund towards project terminal if project ID set and add to balance if it is prefered`, async function () {
    const { jbSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } = await setup();

    let splits = makeSplits({ projectId: PROJECT_ID, preferAddToBalance: true });

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
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    await expect(
      jbSplitsPayer.pay(
        DEFAULT_PROJECT_ID,
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

  it(`Should send fund towards project terminal if project ID set, using pay with beneficiaries set in splits`, async function () {
    const { beneficiaryOne, beneficiaryTwo, jbSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } = await setup();
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
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    await expect(
      jbSplitsPayer.pay(
        DEFAULT_PROJECT_ID,
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

  it(`Should send fund towards project terminal if project ID set, using pay with the caller as beneficiary is none is set in splits`, async function () {
    const { caller, jbSplitsPayer, mockJbSplitsStore, mockJbDirectory, mockJbTerminal } = await setup();

    let splits = makeSplits({ projectId: PROJECT_ID});

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
            caller.address,
            0, /*hardcoded*/
            split.preferClaimed,
            INITIAL_MEMO,
            INITIAL_METADATA
          )
          .returns(0); // Not used
      })
    );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    await expect(
      jbSplitsPayer
        .connect(caller)
        .pay(
          DEFAULT_PROJECT_ID,
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

  it(`Should send fund directly to a beneficiary set in split, if no allocator or project ID is set in splits`, async function () {
    const { caller, beneficiaryOne, beneficiaryTwo, jbSplitsPayer, mockJbSplitsStore } = await setup();

    let splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address]});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    let tx = await jbSplitsPayer
              .connect(caller)
              .pay(
                DEFAULT_PROJECT_ID,
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
              );

    await expect(tx).to.changeEtherBalance(beneficiaryOne, AMOUNT.mul(splits[0].percent).div(maxSplitsPercent));
    await expect(tx).to.changeEtherBalance(beneficiaryTwo, AMOUNT.mul(splits[0].percent).div(maxSplitsPercent));
  });

  it(`Should send fund directly to the caller, if no allocator, project ID or beneficiary is set`, async function () {
    const { caller, jbSplitsPayer, mockJbSplitsStore } = await setup();

    let splits = makeSplits();

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    let tx = await jbSplitsPayer
              .connect(caller)
              .pay(
                DEFAULT_PROJECT_ID,
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
              );

    await expect(tx).to.changeEtherBalance(caller, 0); // Send then receive the amount (gas is not taken into account)
  });

  it.only(`Should send leftover to beneficiary if no project id set`, async function () {
    const { caller, jbSplitsPayer, mockJbDirectory, mockJbSplitsStore, mockJbTerminal, beneficiaryOne, beneficiaryTwo, beneficiaryThree } = await setup();

    // 50% to beneficiaries
    let splits = makeSplits({ count: 2, beneficiary: [beneficiaryOne.address, beneficiaryTwo.address], percent: maxSplitsPercent.div('4')});

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(DEFAULT_PROJECT_ID, DEFAULT_SPLITS_DOMAIN, DEFAULT_SPLITS_GROUP)
      .returns(splits);
    
    await mockJbTerminal.mock.decimals.returns(18);

    // await mockJbDirectory.mock.primaryTerminalOf
    //   .withArgs(DEFAULT_PROJECT_ID, ethToken)
    //   .returns(mockJbTerminal.address);
    
    await mockJbTerminal.mock.pay
      .withArgs(
        AMOUNT.div('2'),
        0,
        beneficiaryThree.address,
        MIN_RETURNED_TOKENS,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA
      )
      .returns(0); // Not used
    
    let tx = await jbSplitsPayer
              .connect(caller)
              .pay(
                0,
                ethToken,
                AMOUNT,
                DEFAULT_DECIMALS,
                beneficiaryThree.address,
                MIN_RETURNED_TOKENS,
                PREFER_CLAIMED_TOKENS,
                MEMO,
                METADATA,
                {
                  value: AMOUNT,
                },
              );

    await expect(tx).to.changeEtherBalance(beneficiaryThree, AMOUNT.div('2'));
  });

  // should send leftover to beneficiary if no project id set

  // should set leftover to the caller if no project id nor beneficiary is set

  it(`Cannot send ETH with another token as argument`, async function () {
    const { jbSplitsPayer, mockToken } = await setup();

    await expect(
      jbSplitsPayer
              .pay(
                DEFAULT_PROJECT_ID,
                mockToken.address,
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
              )
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
});
