const fs = require('fs');
const dotenv = require('dotenv');
const taskNames = require('hardhat/builtin-tasks/task-names');

require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-gas-reporter');
require('hardhat-deploy');
require('solidity-coverage');

dotenv.config();

const defaultNetwork = 'localhost';

function mnemonic() {
  try {
    return fs.readFileSync('./mnemonic.txt').toString().trim();
  } catch (e) {
    if (defaultNetwork !== 'localhost') {
      console.log('☢️ WARNING: No mnemonic file created for a deploy account.');
    }
  }
  return '';
}

const infuraId = process.env.INFURA_ID;

module.exports = {
  defaultNetwork,
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: 'http://localhost:8545',
      blockGasLimit: 0x1fffffffffffff,
    },
    goerli: {
      url: 'https://goerli.infura.io/v3/' + infuraId,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    mainnet: {
      url: 'https://mainnet.infura.io/v3/' + infuraId,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    feeCollector: {
      default: 0,
    },
  },
  paths: {
    sources: './contracts/',
  },
  solidity: {
    version: '0.8.16',
    settings: {
      optimizer: {
        enabled: true,
        // https://docs.soliditylang.org/en/v0.8.10/internals/optimizer.html#:~:text=Optimizer%20Parameter%20Runs,-The%20number%20of&text=A%20%E2%80%9Cruns%E2%80%9D%20parameter%20of%20%E2%80%9C,is%202**32%2D1%20.
        runs: 10000,
      },
    },
  },
  mocha: {
    bail: true,
    timeout: 12000,
  },
  gasReporter: {
    currency: 'USD',
    // gasPrice: 21,
    enabled: !!process.env.REPORT_GAS,
    showTimeSpent: true,
  },
  etherscan: {
    apiKey: `${process.env.ETHERSCAN_API_KEY}`,
  },
};

task('deploy-ballot', 'Deploy a buffer ballot of a given duration')
  .addParam('duration', 'Set the ballot duration (in seconds)')
  .setAction(async (taskArgs, hre) => {
    try {
      const { deploy } = deployments;
      const [deployer] = await hre.ethers.getSigners();

      const JBReconfigurationBufferBallot = await deploy('JBReconfigurationBufferBallot', {
        from: deployer.address,
        log: true,
        args: [taskArgs.duration],
      });

      console.log('Buffer ballot deployed at ' + JBReconfigurationBufferBallot.address);
    } catch (error) {
      console.log(error);
    }
  });
