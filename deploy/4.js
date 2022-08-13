const { ethers } = require('hardhat');

/**
 * Deploys a new ProjectPayerDeployer that takes changes into account. This will be executed as a stand-alone procedure with no dependencies.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby --tag 3
 */
module.exports = async ({ deployments, getChainId }) => {
  console.log("Deploying 4");

  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  let chainId = await getChainId();
  let baseDeployArgs = {
    from: deployer.address,
    log: true
  };

  console.log({ deployer: deployer.address, chain: chainId });

  // Deploy a JBETHERC20ProjectPayerDeployer contract.
  await deploy('JBETHERC20ProjectPayerDeployer', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/JBETHERC20ProjectPayerDeployer.sol:JBETHERC20ProjectPayerDeployer",
    args: [],
  });

  console.log('Done');
};

module.exports.tags = ['4'];