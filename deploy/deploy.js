const { ethers } = require('hardhat');

/**
 * Deploys the entire Juice V2 contract suite.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby
 */
module.exports = async ({ deployments, getChainId }) => {
  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  let multisigAddress;
  let chainlinkV2UsdEthPriceFeed;
  let chainId = await getChainId();
  let baseDeployArgs = {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  };
  let protocolProjectStartsAtOrAfter;

  console.log({ deployer: deployer.address, chain: chainId });

  switch (chainId) {
    // mainnet
    case '1':
      multisigAddress = '0xAF28bcB48C40dBC86f52D459A6562F658fc94B1e';
      chainlinkV2UsdEthPriceFeed = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
      protocolProjectStartsAtOrAfter = 1650741573;
      break;
    // rinkeby
    case '4':
      multisigAddress = '0xAF28bcB48C40dBC86f52D459A6562F658fc94B1e';
      chainlinkV2UsdEthPriceFeed = '0x8A753747A1Fa494EC906cE90E9f37563A8AF630e';
      protocolProjectStartsAtOrAfter = 0;
      break;
    // hardhat / localhost
    case '31337':
      multisigAddress = deployer.address;
      protocolProjectStartsAtOrAfter = 0;
      break;
  }

  console.log({ multisigAddress, protocolProjectStartsAtOrAfter });

  // Deploy a JBETHERC20ProjectPayerDeployer contract.
  await deploy('JBETHERC20ProjectPayerDeployer', {
    ...baseDeployArgs,
    args: [],
  });

  // Deploy a JBETHERC20SplitsPayerDeployer contract.
  await deploy('JBETHERC20SplitsPayerDeployer', {
    ...baseDeployArgs,
    args: [],
  });

  // Deploy a JBOperatorStore contract.
  const JBOperatorStore = await deploy('JBOperatorStore', {
    ...baseDeployArgs,
    args: [],
  });

  // Deploy a JBPrices contract.
  const JBPrices = await deploy('JBPrices', {
    ...baseDeployArgs,
    args: [deployer.address],
  });

  // Deploy a JBProjects contract.
  const JBProjects = await deploy('JBProjects', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address],
  });

  // Get the future address of JBFundingCycleStore
  const transactionCount = await deployer.getTransactionCount()

  const FundingCycleStoreFutureAddress = ethers.utils.getContractAddress({
    from: deployer.address,
    nonce: transactionCount + 1
  })

  // Deploy a JBDirectory.
  const JBDirectory = await deploy('JBDirectory', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address, JBProjects.address, FundingCycleStoreFutureAddress, deployer.address],
  });

  // Deploy a JBFundingCycleStore.
  const JBFundingCycleStore = await deploy('JBFundingCycleStore', {
    ...baseDeployArgs,
    args: [JBDirectory.address],
  });

  // Deploy a JB3DayReconfigurationBufferBallot.
  const JB3DayReconfigurationBufferBallot = await deploy('JBReconfigurationBufferBallot', {
    ...baseDeployArgs,
    args: [259200, JBFundingCycleStore.address],
  });

  // Deploy a JB7DayReconfigurationBufferBallot.
  await deploy('JBReconfigurationBufferBallot', {
    ...baseDeployArgs,
    args: [604800, JBFundingCycleStore.address],
  });

  // Deploy a JBTokenStore.
  const JBTokenStore = await deploy('JBTokenStore', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
  });

  // Deploy a JBSplitStore.
  const JBSplitStore = await deploy('JBSplitsStore', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
  });

  // Deploy a JBController contract.
  const JBController = await deploy('JBController', {
    ...baseDeployArgs,
    args: [
      JBOperatorStore.address,
      JBProjects.address,
      JBDirectory.address,
      JBFundingCycleStore.address,
      JBTokenStore.address,
      JBSplitStore.address,
    ],
  });

  // Deploy a JBSingleTokenPaymentTerminalStore contract.
  const JBSingleTokenPaymentTerminalStore = await deploy('JBSingleTokenPaymentTerminalStore', {
    ...baseDeployArgs,
    args: [JBDirectory.address, JBFundingCycleStore.address, JBPrices.address],
  });

  // Deploy the currencies library.
  const JBCurrencies = await deploy('JBCurrencies', {
    ...baseDeployArgs,
    args: [],
  });

  // Get references to contract that will have transactions triggered.
  const jbDirectoryContract = new ethers.Contract(JBDirectory.address, JBDirectory.abi);
  const jbPricesContract = new ethers.Contract(JBPrices.address, JBPrices.abi);
  const jbControllerContract = new ethers.Contract(JBController.address, JBController.abi);
  const jbProjects = new ethers.Contract(JBProjects.address, JBProjects.abi);
  const jbCurrenciesLibrary = new ethers.Contract(JBCurrencies.address, JBCurrencies.abi);

  // Get a reference to USD and ETH currency indexes.
  const USD = await jbCurrenciesLibrary.connect(deployer).USD();
  const ETH = await jbCurrenciesLibrary.connect(deployer).ETH();

  // Deploy a JBETHPaymentTerminal contract.
  const JBETHPaymentTerminal = await deploy('JBETHPaymentTerminal', {
    ...baseDeployArgs,
    args: [
      ETH,
      JBOperatorStore.address,
      JBProjects.address,
      JBDirectory.address,
      JBSplitStore.address,
      JBPrices.address,
      JBSingleTokenPaymentTerminalStore.address,
      multisigAddress,
    ],
  });

  // Get a reference to an existing ETH/USD feed.
  const usdEthFeed = await jbPricesContract.connect(deployer).feedFor(USD, ETH);

  // If needed, deploy an ETH/USD price feed and add it to the store.
  if (chainlinkV2UsdEthPriceFeed && usdEthFeed == ethers.constants.AddressZero) {
    // Deploy a JBChainlinkV3PriceFeed contract for ETH/USD.
    const JBChainlinkV3UsdEthPriceFeed = await deploy('JBChainlinkV3PriceFeed', {
      ...baseDeployArgs,
      args: [chainlinkV2UsdEthPriceFeed],
    });

    //The base currency is ETH since the feed returns the USD price of 1 ETH.
    await jbPricesContract
      .connect(deployer)
      .addFeedFor(USD, ETH, JBChainlinkV3UsdEthPriceFeed.address);
  }

  // If needed, transfer the ownership of the JBPrices to to the multisig.
  if ((await jbPricesContract.connect(deployer).owner()) != multisigAddress)
    await jbPricesContract.connect(deployer).transferOwnership(multisigAddress);

  let isAllowedToSetFirstController = await jbDirectoryContract
    .connect(deployer)
    .isAllowedToSetFirstController(JBController.address);

  console.log({ isAllowedToSetFirstController });

  // If needed, allow the controller to set projects' first controller, then transfer the ownership of the JBDirectory to the multisig.
  if (
    !isAllowedToSetFirstController
  ) {
    let tx = await jbDirectoryContract
      .connect(deployer)
      .setIsAllowedToSetFirstController(JBController.address, true);
    await tx.wait();
  }

  // If needed, transfer the ownership of the JBDirectory contract to the multisig.
  if ((await jbDirectoryContract.connect(deployer).owner()) != multisigAddress)
    await jbDirectoryContract.connect(deployer).transferOwnership(multisigAddress);


  // If needed, deploy the protocol project
  if ((await jbProjects.connect(deployer).count()) == 0) {

    console.log('Adding reserved token splits with current beneficiaries (as of deployment)');

    let beneficiaries = [];

    if(chainId == 1) {
      beneficiaries =
        [
          'jango.eth',
          'peri.eth',  
          'zeugh.eth',
          'atomicmieos.eth',
          'sagekellyn.eth',
          'johnnyd.eth',
          'DrGorilla.eth',
          'filipv.eth',
          'twodam.eth',
          '0xstvg.eth',
          'aeolian.eth',
          'zom-bae.eth',
          '0x5d95baEBB8412AD827287240A5c281E3bB30d27E',
          '0x111040F27f05E2017e32B9ac6d1e9593E4E19A2a',
          '0x1DD2091f250876Ba87B6fE17e6ca925e1B1c0CF0'
        ]
    } else {
      beneficiaries =
        [
          '0x823b92d6a4b2aed4b15675c7917c9f922ea8adad',
          '0x63a2368f4b509438ca90186cb1c15156713d5834',  
          '0xf7253a0e87e39d2cd6365919d4a3d56d431d0041',
          '0xe7879a2D05dBA966Fcca34EE9C3F99eEe7eDEFd1',
          '0x90eda5165e5e1633e0bdb6307cdecae564b10ff7',
          '0xf0fe43a75ff248fd2e75d33fa1ebde71c6d1abad',
          '0x6860f1a0cf179ed93abd3739c7f6c8961a4eea3c',
          '0x30670d81e487c80b9edc54370e6eaf943b6eab39',
          '0xca6ed3fdc8162304d7f1fcfc9ca3a81632d5e5b0',
          '0x28c173b8f20488eef1b0f48df8453a2f59c38337',
          '0xe16a238d207b9ac8b419c7a866b0de013c73357b',
          '0x34724d71ce674fcd4d06e60dd1baa88c14d36b75',
          '0x5d95baEBB8412AD827287240A5c281E3bB30d27E',
          '0x111040F27f05E2017e32B9ac6d1e9593E4E19A2a',
          '0x1DD2091f250876Ba87B6fE17e6ca925e1B1c0CF0'
        ]
    }

    let splits = [];
  
    beneficiaries.map( (beneficiary) => {
      splits.push({
        preferClaimed: false,
        preferAddToBalance: false,
        percent: ( (1000000000 - 400000000) / beneficiaries.length), // 40% for JBDao
        projectId: 0,
        beneficiary: beneficiary,
        lockedUntil: 0,
        allocator: ethers.constants.AddressZero
      })
    });
  
    splits.push({
      preferClaimed: false,
      preferAddToBalance: false,
      percent: 400000000, // 40% for JBDao
      projectId: 0,
      beneficiary: chainId == 1 ? 'dao.juicebox.eth' : '0xaf28bcb48c40dbc86f52d459a6562f658fc94b1e',
      lockedUntil: 0,
      allocator: ethers.constants.AddressZero
    })
  
    let groupedSplits = {
      group: 2,
      splits: splits
    }

    console.log('Deploying protocol project...');

    await jbControllerContract.connect(deployer).launchProjectFor(
      /*owner*/ multisigAddress,

      /* projectMetadata */
      [
        /*content*/ 'QmToqoMoakcVuGbELoJYRfWY5N7qr3Jawxq3xH6u3tbPiv',
        /*domain*/ ethers.BigNumber.from(0),
      ],

      /*fundingCycleData*/
      [
        /*duration*/ ethers.BigNumber.from(1209600),
        /*weight*/ ethers.BigNumber.from('112070661021759343680000'),
        /*discountRate*/ ethers.BigNumber.from(100000000),
        /*ballot*/ JB3DayReconfigurationBufferBallot.address,
      ],

      /*fundingCycleMetadata*/
      [
        /*reservedRate*/ ethers.BigNumber.from(5000),
        /*redemptionRate*/ ethers.BigNumber.from(9500),
        /*ballotRedemptionRate*/ ethers.BigNumber.from(9500),
        /*pausePay*/ false,
        /*pauseDistributions*/ false,
        /*pauseRedeem*/ false,
        /*pauseBurn*/ false,
        /*allowMinting*/ false,
        /*allowChangeToken*/ false,
        /*allowTerminalMigration*/ false,
        /*allowControllerMigration*/ false,
        /*allowSetTerminals*/ false,
        /*allowSetController*/ false,
        /*holdFees*/ false,
        /*useTotalOverflowForRedemptions*/ false,
        /*useDataSourceForPay*/ false,
        /*useDataSourceForRedeem*/ false,
        /*dataSource*/ ethers.constants.AddressZero,
      ],

      /*mustStartAtOrAfter*/ ethers.BigNumber.from(protocolProjectStartsAtOrAfter),

      /*groupedSplits*/[groupedSplits],

      /*fundAccessConstraints*/[],

      /*terminals*/[JBETHPaymentTerminal.address],

      /*memo*/ '',
    );
  }

  console.log('Done');
};
