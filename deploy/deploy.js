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
    // On mainnet, we will not redeploy contracts if they have already been deployed.
    skipIfAlreadyDeployed: chainId === '1',
  };
  let protocolProjectStartsAtOrAfter;

  console.log({ deployer: deployer.address, chain: chainId });

  switch (chainId) {
    // mainnet
    case '1':
      multisigAddress = '0xAF28bcB48C40dBC86f52D459A6562F658fc94B1e';
      chainlinkV2UsdEthPriceFeed = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
      protocolProjectStartsAtOrAfter = 1649531973;
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
        /*weight*/ ethers.BigNumber.from(2)
          .pow(10)
          .mul(ethers.BigNumber.from(3).pow(33))
          .mul(ethers.BigNumber.from(5).pow(5))
          .mul(7),
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

      /*groupedSplits*/[],

      /*fundAccessConstraints*/[],

      /*terminals*/[JBETHPaymentTerminal.address],

      /*memo*/ '',
    );
  }

  console.log('Done');
};
