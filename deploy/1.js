const { ethers } = require('hardhat');

/**
 * Deploys the Juicebox V2 contract ecosystem.
 *
 * Example usage:
 *
 * npx hardhat deploy --network goerli --tags 1
 */
module.exports = async ({ deployments, getChainId }) => {
  console.log('Deploying 1');

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
      protocolProjectStartsAtOrAfter = 1664047173;
      break;
    // Goerli
    case '5':
      multisigAddress = '0x46D623731E179FAF971CdA04fF8c499C95461b3c';
      chainlinkV2UsdEthPriceFeed = '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e';
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
    contract: 'contracts/JBETHERC20SplitsPayerDeployer.sol:JBETHERC20SplitsPayerDeployer',
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
  const transactionCount = await deployer.getTransactionCount();

  const FundingCycleStoreFutureAddress = ethers.utils.getContractAddress({
    from: deployer.address,
    nonce: transactionCount + 1,
  });

  // Deploy a JBDirectory.
  const JBDirectory = await deploy('JBDirectory', {
    ...baseDeployArgs,
    args: [
      JBOperatorStore.address,
      JBProjects.address,
      FundingCycleStoreFutureAddress,
      deployer.address,
    ],
  });

  // Deploy a JBFundingCycleStore.
  const JBFundingCycleStore = await deploy('JBFundingCycleStore', {
    ...baseDeployArgs,
    contract: 'contracts/JBFundingCycleStore.sol:JBFundingCycleStore',
    args: [JBDirectory.address],
  });

  // Deploy a JBTokenStore.
  const JBTokenStore = await deploy('JBTokenStore', {
    ...baseDeployArgs,
    args: [
      JBOperatorStore.address,
      JBProjects.address,
      JBDirectory.address,
      JBFundingCycleStore.address,
    ],
  });

  // Deploy a JBSplitStore.
  const JBSplitStore = await deploy('JBSplitsStore', {
    ...baseDeployArgs,
    contract: 'contracts/JBSplitsStore.sol:JBSplitsStore',
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
  });

  // Deploy a JBController contract.
  const JBController = await deploy('JBController', {
    ...baseDeployArgs,
    contract: 'contracts/JBController.sol:JBController',
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
    contract: 'contracts/JBSingleTokenPaymentTerminalStore.sol:JBSingleTokenPaymentTerminalStore',
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
    contract: 'contracts/JBETHPaymentTerminal.sol:JBETHPaymentTerminal',
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
  if (!isAllowedToSetFirstController) {
    let tx = await jbDirectoryContract
      .connect(deployer)
      .setIsAllowedToSetFirstController(JBController.address, true);
    await tx.wait();
  }

  // If needed, transfer the ownership of the JBDirectory contract to the multisig.
  if ((await jbDirectoryContract.connect(deployer).owner()) != multisigAddress) {
    let tx = await jbDirectoryContract.connect(deployer).transferOwnership(multisigAddress);
    await tx.wait();
  }

  // If needed, deploy the protocol project
  if ((await jbProjects.connect(deployer).count()) == 0) {
    console.log('Adding reserved token splits with current beneficiaries (as of deployment)');

    const beneficiaries = [
      `0x428f196c4D754A96642854AC5d9f29a0e6eC707E`,
      `0xF8284136B169213E4c50cE09f3E1D9A9b484BAea`,
      `0x25910143C255828F623786f46fe9A8941B7983bB`,
      `0xC0b8eed3314B625d0c4eBC5432a5bd4f31370B4d`,
      `0xA8488938161c9Afa127E93Fef6d3447051588664`,
      `0x2DdA8dc2f67f1eB94b250CaEFAc9De16f70c5A51`,
      `0x5706d5aD7A68bf8692bD341234bE44ca7Bf2f654`,
      `0xb045708e396E20071324C1aed2E4CFB90A0764FE`,
      `0x823b92d6a4b2AED4b15675c7917c9f922ea8ADAD`,
      `0x63A2368F4B509438ca90186cb1C15156713D5834`,
      `0xE16a238d207B9ac8B419C7A866b0De013c73357B`,
      `0x28C173B8F20488eEF1b0f48Df8453A2f59C38337`,
      `0xca6Ed3Fdc8162304d7f1fCFC9cA3A81632d5E5B0`,
      `0x30670D81E487c80b9EDc54370e6EaF943B6EAB39`,
      `0x6860f1A0cF179eD93ABd3739c7f6c8961A4EEa3c`,
      `0xf0FE43a75Ff248FD2E75D33fa1ebde71c6d1abAd`,
      `0x34724D71cE674FcD4d06e60Dd1BaA88c14D36b75`,
      `0x5d95baEBB8412AD827287240A5c281E3bB30d27E`,
      `0x111040F27f05E2017e32B9ac6d1e9593E4E19A2a`,
      `0xf7253A0E87E39d2cD6365919D4a3D56D431D0041`,
      `0x1DD2091f250876Ba87B6fE17e6ca925e1B1c0CF0`,
      `0xe7879a2D05dBA966Fcca34EE9C3F99eEe7eDEFd1`,
      `0x90eda5165e5E1633E0Bdb6307cDecaE564b10ff7`,
      `0xfda746f4c3f9f5a02b3e63ed6d0ebbc002d1f788`,
      `0x68dfb9b374b0a1ce996770ddf32916a530b4785f`,
      `0x123a3c28eb9e701c173d3a73412489f3554f3005`,
    ];

    let splits = [];

    beneficiaries.map((beneficiary) => {
      splits.push({
        preferClaimed: false,
        preferAddToBalance: false,
        percent: (1000000000 - 300600000) / beneficiaries.length, // 30.06% for JBDao
        projectId: 0,
        beneficiary: beneficiary,
        lockedUntil: 0,
        allocator: ethers.constants.AddressZero,
      });
    });

    splits.push({
      preferClaimed: false,
      preferAddToBalance: false,
      percent: 300600000, // 30.06% for JBDao
      projectId: 0,
      beneficiary: '0xaf28bcb48c40dbc86f52d459a6562f658fc94b1e',
      lockedUntil: 0,
      allocator: ethers.constants.AddressZero,
    });

    let groupedSplits = {
      group: 2,
      splits: splits,
    };

    // Deploy a JB3DayReconfigurationBufferBallot.
    const JB3DayReconfigurationBufferBallot = await deploy('JB3DayReconfigurationBufferBallot', {
      ...baseDeployArgs,
      contract: "contracts/JBReconfigurationBufferBallot.sol:JBReconfigurationBufferBallot",
      args: [259200],
    });

    // Deploy a JB7DayReconfigurationBufferBallot.
    await deploy('JB7DayReconfigurationBufferBallot', {
      ...baseDeployArgs,
      contract: "contracts/JBReconfigurationBufferBallot.sol:JBReconfigurationBufferBallot",
      args: [604800],
    });

    console.log('Deploying protocol project...');

    await jbControllerContract.connect(deployer).launchProjectFor(
      /*owner*/ multisigAddress,

      /* projectMetadata */
      [
        /*content*/ 'QmQHGuXv7nDh1rxj48HnzFtwvVxwF1KU9AfB6HbfG8fmJF',
        /*domain*/ ethers.BigNumber.from(0),
      ],

      /*fundingCycleData*/
      [
        /*duration*/ ethers.BigNumber.from(1209600),
        /*weight*/ ethers.BigNumber.from('62850518250000000000000'),
        /*discountRate*/ ethers.BigNumber.from(5000000),
        /*ballot*/ JB3DayReconfigurationBufferBallot.address,
      ],

      /*fundingCycleMetadata*/
      [
        /*global*/
        [/*allowSetTerminals*/ false, /*allowSetController*/ true, /*pauseTransfer*/ true],
        /*reservedRate*/ ethers.BigNumber.from(5000),
        /*redemptionRate*/ ethers.BigNumber.from(0),
        /*ballotRedemptionRate*/ ethers.BigNumber.from(0),
        /*pausePay*/ false,
        /*pauseDistributions*/ false,
        /*pauseRedeem*/ false,
        /*pauseBurn*/ false,
        /*allowMinting*/ false,
        /*allowTerminalMigration*/ false,
        /*allowControllerMigration*/ false,
        /*holdFees*/ false,
        /*preferClaimedTokenOverride*/ false,
        /*useTotalOverflowForRedemptions*/ false,
        /*useDataSourceForPay*/ false,
        /*useDataSourceForRedeem*/ false,
        /*dataSource*/ ethers.constants.AddressZero,
        /*metadata*/ 0,
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

module.exports.tags = ['1'];
