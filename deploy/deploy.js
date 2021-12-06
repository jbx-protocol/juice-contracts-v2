const { ethers } = require("hardhat");

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

  // Add the deployed JBController as a known controller.
  const [signer, ..._] = await ethers.getSigners()
  const jbDirectoryContract = new ethers.Contract(JBDirectory.address, JBDirectory.abi);
  await jbDirectoryContract.connect(signer).addToSetControllerAllowlist(JBController.address)

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

  await deploy('JBETHPaymentTerminal', {
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
};
