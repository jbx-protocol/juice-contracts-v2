const { ethers } = require('hardhat');
const toFundBack = require("./toFundBack.json")
const toReimburseForGas = require("./gasReimburse.json")
const JBTerminal = require("../deployments/mainnet/JBETHPaymentTerminal.json");

/**
 * Deploy and use a multipayer contract
 * 
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby --tag 3
 */
module.exports = async ({ deployments, getChainId }) => {
  console.log("Deploying multipayer & send payment");

  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  let multisigAddress;
  let chainId = await getChainId();
  let baseDeployArgs = {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  };

  console.log({ deployer: deployer.address, chain: chainId });

  switch (chainId) {
    // mainnet
    case '1':
      multisigAddress = '0xAF28bcB48C40dBC86f52D459A6562F658fc94B1e';
      break;
    // rinkeby
    case '4':
      multisigAddress = '0xAF28bcB48C40dBC86f52D459A6562F658fc94B1e';
      break;
    // hardhat / localhost
    case '31337':
      multisigAddress = deployer.address;
      break;
  }

  console.log({ multisigAddress });

  const multipayDeployment = await deploy('Multipay', {
    ...baseDeployArgs,
    args: [JBTerminal.address],
  });

  const multipay = new ethers.Contract(multipayDeployment.address, multipayDeployment.abi);

  let projectId = [];
  let amounts = [];
  let beneficiaries = [];
  let memos = [];
  let projectToReimburseGas = [];

  for (let i = 0; i < toFundBack.length; i++) {
    projectId[i] = toFundBack[i].projectId;
    beneficiaries[i] = toFundBack[i].beneficiaries;
    amounts[i] = toFundBack[i].amounts;
    memos[i] = toFundBack[i].memos;
  }

  for (let i = 0; i < toReimburseForGas[0].projectIds.length; i++) {
    projectToReimburseGas[i] = toReimburseForGas[0].projectIds[i];
  }

  const ethToSend = await multipay.connect(deployer).computeTotalEthToSend(
    projectId,
    beneficiaries,
    amounts,
    memos,
    projectToReimburseGas
  );

  console.log('about to send ' + ethToSend / 10 ** 18 + 'eth');

  await multipay.connect(deployer).process(
    projectId,
    beneficiaries,
    amounts,
    memos,
    projectToReimburseGas,
    { value: ethToSend }
  );

  console.log('Done');
};

module.exports.tags = ['3'];