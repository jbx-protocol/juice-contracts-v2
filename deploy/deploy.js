const { ethers } = require('hardhat');

/**
 * Deploys the Juice V2 contracts.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby
 *
 * TODO(odd-amphora): Conditionally use `skipIfAlreadyDeployed` iff mainnet.
 */
module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  let multisigAddress;

  console.log({ deployer, k: await getChainId() });
  switch (await getChainId()) {
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
    from: deployer,
    args: [],
    log: true,
  });

  const JBPrices = await deploy('JBPrices', {
    from: deployer,
    args: [multisigAddress],
    log: true,
  });

  const JBProjects = await deploy('JBProjects', {
    from: deployer,
    args: [JBOperatorStore.address],
    log: true,
  });

  const JBDirectory = await deploy('JBDirectory', {
    from: deployer,
    args: [JBOperatorStore.address, JBProjects.address],
    log: true,
  });

  const JBFundingCycleStore = await deploy('JBFundingCycleStore', {
    from: deployer,
    args: [JBDirectory.address],
    log: true,
  });

  const JBTokenStore = await deploy('JBTokenStore', {
    from: deployer,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
    log: true,
  });

  const JBSplitStore = await deploy('JBSplitsStore', {
    from: deployer,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
    log: true,
  });

  const JBController = await deploy('JBController', {
    from: deployer,
    args: [
      JBOperatorStore.address,
      JBProjects.address,
      JBDirectory.address,
      JBFundingCycleStore.address,
      JBTokenStore.address,
      JBSplitStore.address,
    ],
    log: true,
  });

  // Add the deployed JBController as a known controller, then transfer ownership to the multisig.
  const [signer, ..._] = await ethers.getSigners();
  const jbDirectoryContract = new ethers.Contract(JBDirectory.address, JBDirectory.abi);

  // Note: these will revert if already set, which might happen during deploys.
  if (!(await jbDirectoryContract.connect(signer).isAllowedToSetController(JBController.address))) {
    await jbDirectoryContract.connect(signer).addToSetControllerAllowlist(JBController.address);
  }
  if ((await jbDirectoryContract.connect(signer).owner()) != multisigAddress) {
    await jbDirectoryContract.connect(signer).transferOwnership(multisigAddress);
  }

  const JBETHPaymentTerminalStore = await deploy('JBETHPaymentTerminalStore', {
    from: deployer,
    args: [
      JBPrices.address,
      JBProjects.address,
      JBDirectory.address,
      JBFundingCycleStore.address,
      JBTokenStore.address,
    ],
    log: true,
  });

  const JBETHPaymentTerminal = await deploy('JBETHPaymentTerminal', {
    from: deployer,
    args: [
      JBOperatorStore.address,
      JBProjects.address,
      JBDirectory.address,
      JBSplitStore.address,
      JBETHPaymentTerminalStore.address,
      multisigAddress,
    ],
    log: true,
  });

  console.log('Deloying project...');
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

    /*groupedSplits*/ [],

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

    /*terminals*/ [JBETHPaymentTerminal.address],
  );

  console.log('Done');
};
