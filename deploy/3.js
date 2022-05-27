const { ethers } = require('hardhat');

/**
 * Deploys a second version of many contracts for projects to migrate onto.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby
 */
module.exports = async ({ deployments }) => {
  console.log("Deploying 3");

  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  let baseDeployArgs = {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: false,
  };

  // Deploy a new JBETHERC20SplitsPayerDeployer contract.
  await deploy('JBETHERC20SplitsPayerDeployer_2', {
    ...baseDeployArgs,
    contract: "contracts/JBETHERC20SplitsPayerDeployer/2.sol:JBETHERC20SplitsPayerDeployer",
    args: [],
  });

  console.log('Done');
};

module.exports.tags = ['3'];