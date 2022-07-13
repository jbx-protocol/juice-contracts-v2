const { ethers } = require('hardhat');

/**
 * Deploys a new SplitsPayerDeployer that deploys an updated SplitsPayer. This will be executed as a stand-alone procedure with no dependencies.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby --tag 3
 */
module.exports = async ({ deployments }) => {
  console.log("Signing 4");

  const [deployer] = await ethers.getSigners();

  const signed = await deployer.signMessage(`Requesting Similar Match verification using address ${deployer.address} on 07/11/2022`);
  console.log({ signed, deployer: deployer.address });

  console.log('Done');
};

module.exports.tags = ['4'];