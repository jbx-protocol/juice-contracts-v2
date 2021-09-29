/**
 * Deploys the Juice V2 contracts.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby
 */
module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const JBOperatorStore = await deploy('JBOperatorStore', {
    from: deployer,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBPrices = await deploy('JBPrices', {
    from: deployer,
    args: [],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBProjects = await deploy('JBProjects', {
    from: deployer,
    args: [JBOperatorStore.address],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBDirectory = await deploy('JBDirectory', {
    from: deployer,
    args: [JBOperatorStore.address, JBProjects.address],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBFundingCycleStore = await deploy('JBFundingCycleStore', {
    from: deployer,
    args: [JBDirectory.address],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBTokenStore = await deploy('JBTokenStore', {
    from: deployer,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBSplitStore = await deploy('JBSplitsStore', {
    from: deployer,
    args: [JBOperatorStore.address, JBProjects.address, JBDirectory.address],
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const JBControllerV1 = await deploy('JBControllerV1', {
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
    skipIfAlreadyDeployed: true,
  });

  const _ = await deploy('JBETHPaymentTerminal', {
    from: deployer,
    args: [
      JBOperatorStore.address,
      JBPrices.address,
      JBProjects.address,
      JBDirectory.address,
      JBFundingCycleStore.address,
      JBTokenStore.address,
      JBSplitStore.address,
      JBControllerV1.address,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
  });
};
