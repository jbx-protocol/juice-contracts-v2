/**
 * Deploys the Juice V2 contracts.
 *
 * Example usage:
 * 
 * npx hardhat deploy \
 *   --network rinkeby \
 *   --tags JuiceV2 \
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

  // TODO(odd-amphora): write remaining.
};
module.exports.tags = ['JuiceV2'];
