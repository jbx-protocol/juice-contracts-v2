const { ethers } = require('hardhat');

/**
 * Deploys the entire Juice V2 contract suite.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby
 */
module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let multisigAddress;
  let chainId = await getChainId();
  let baseDeployArgs = {
    from: deployer,
    log: true,
    // On mainnet, we will not redeploy contracts if they have already been deployed.
    skipIfAlreadyDeployed: chainId === '1',
  };

  console.log({ deployer, chain: chainId });
  switch (chainId) {
    // mainnet
    case '1':
      multisigAddress = '0xAF28bcB48C40dBC86f52D459A6562F658fc94B1e';
      break;
    // rinkeby
    case '4':
      multisigAddress = '0x69C6026e3938adE9e1ddE8Ff6A37eC96595bF1e1';
      break;
    // hardhat / localhost
    case '31337':
      multisigAddress = deployer;
      break;
  }

  console.log({ multisigAddress });

  const JBOperatorStore = await deploy('JBOperatorStore', {
    ...baseDeployArgs,
    args: [],
  });

  const JBPrices = await deploy('JBPrices', {
    ...baseDeployArgs,
    args: [multisigAddress],
  });

  const JBProjects = await deploy('JBProjects', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address],
  });

  const JBDirectory = await deploy('JBDirectory', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address, JBProjects.address],
  });

  const JBFundingCycleStore = await deploy('JBFundingCycleStore', {
    ...baseDeployArgs,
    args: [JBDirectory.address],
  });

  const JBTokenStore = await deploy('JBTokenStore', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
  });

  const JBSplitStore = await deploy('JBSplitsStore', {
    ...baseDeployArgs,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
  });

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

  // Add the deployed JBController as a known controller, then transfer ownership to the multisig.
  const [signer, ..._] = await ethers.getSigners();
  const jbDirectoryContract = new ethers.Contract(JBDirectory.address, JBDirectory.abi);

  // Note: these will revert if already set, which might happen during deploys.
  if (!(await jbDirectoryContract.connect(signer).isAllowedToSetController(JBController.address)))
    await jbDirectoryContract.connect(signer).addToSetControllerAllowlist(JBController.address);

  if ((await jbDirectoryContract.connect(signer).owner()) != multisigAddress)
    await jbDirectoryContract.connect(signer).transferOwnership(multisigAddress);

  const JBPaymentTerminalStore = await deploy('JBPaymentTerminalStore', {
    ...baseDeployArgs,
    args: [
      JBPrices.address,
      JBProjects.address,
      JBDirectory.address,
      JBFundingCycleStore.address,
      JBTokenStore.address,
    ],
  });

  const JBETHPaymentTerminal = await deploy('JBETHPaymentTerminal', {
    ...baseDeployArgs,
    args: [
      0,
      JBOperatorStore.address,
      JBProjects.address,
      JBDirectory.address,
      JBSplitStore.address,
      JBPrices.address,
      JBPaymentTerminalStore.address,
      multisigAddress,
    ],
  });

  console.log('Deploying project...');
  const jbControllerContract = new ethers.Contract(JBController.address, JBController.abi);

  // Deploy the protocol project
  await jbControllerContract.connect(signer).launchProjectFor(
    /*owner*/ multisigAddress,

    /* projectMetadata */
    [/*content*/ '', /*domain*/ ethers.BigNumber.from(0)],

    /*fundingCycleData*/
    [
      /*duration*/ ethers.BigNumber.from(1209600),
      /*weight*/ ethers.BigNumber.from(10).pow(18).mul(1000000),
      /*discountRate*/ ethers.BigNumber.from(40000000),
      /*ballot*/ '0x0000000000000000000000000000000000000000',
    ],

    /*fundingCycleMetadata*/
    [
      /*reservedRate*/ ethers.BigNumber.from(5000),
      /*redemptionRate*/ ethers.BigNumber.from(7000),
      /*ballotRedemptionRate*/ ethers.BigNumber.from(7000),
      /*pausePay*/ ethers.BigNumber.from(0),
      /*pauseDistributions*/ ethers.BigNumber.from(0),
      /*pauseRedeem*/ ethers.BigNumber.from(0),
      /*pauseMint*/ ethers.BigNumber.from(1),
      /*pauseBurn*/ ethers.BigNumber.from(0),
      /*allowChangeToken*/ ethers.BigNumber.from(0),
      /*allowTerminalMigration*/ ethers.BigNumber.from(0),
      /*allowControllerMigration*/ ethers.BigNumber.from(0),
      /*holdFees*/ ethers.BigNumber.from(0),
      /*useLocalBalanceForRedemptions*/ ethers.BigNumber.from(0),
      /*useDataSourceForPay*/ ethers.BigNumber.from(0),
      /*useDataSourceForRedeem*/ ethers.BigNumber.from(0),
      /*dataSource*/ '0x0000000000000000000000000000000000000000',
    ],

    /*mustStartOnOrAfter*/ ethers.BigNumber.from(0),

    /*groupedSplits*/[],

    /*fundAccessConstraints*/
    [
      [
        /*terminal*/ JBETHPaymentTerminal.address,
        /*distributionLimit*/ ethers.BigNumber.from(0),
        /*distributionLimitCurrency*/ ethers.BigNumber.from(1),
        /*overflowAllowance*/ ethers.BigNumber.from(0),
        /*overflowAllowanceCurrency*/ ethers.BigNumber.from(0),
      ],
    ],

    /*terminals*/[JBETHPaymentTerminal.address],
  );

  console.log('Done');
};
