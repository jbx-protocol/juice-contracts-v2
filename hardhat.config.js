const fs = require('fs');
const dotenv = require('dotenv');
const web3 = require('ethers');

require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-gas-reporter');
require('hardhat-deploy');

dotenv.config();

const defaultNetwork = 'localhost';

function mnemonic() {
  try {
    return fs.readFileSync('./mnemonic.txt').toString().trim();
  } catch (e) {
    if (defaultNetwork !== 'localhost') {
      console.log(
        '☢️ WARNING: No mnemonic file created for a deploy account.',
      );
    }
  }
  return '';
}

const infuraId = process.env.INFURA_ID;

module.exports = {
  defaultNetwork,
  networks: {
    localhost: {
      url: 'http://localhost:8545'
    },
    rinkeby: {
      url: 'https://rinkeby.infura.io/v3/' + infuraId,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    mainnet: {
      url: 'https://mainnet.infura.io/v3/' + infuraId,
      gasPrice: 50000000000,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    ropsten: {
      url: 'https://ropsten.infura.io/v3/' + infuraId,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    kovan: {
      url: 'https://kovan.infura.io/v3/' + infuraId,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    goerli: {
      url: 'https://goerli.infura.io/v3/' + infuraId,
      accounts: {
        mnemonic: mnemonic(),
      },
    },
    xdai: {
      url: 'https://dai.poa.network',
      gasPrice: 1000000000,
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
  solidity: {
    version: '0.8.6',
    settings: {
      optimizer: {
        enabled: true,
        // https://docs.soliditylang.org/en/v0.6.3/using-the-compiler.html
        runs: 21000,
      },
    },
  },
  mocha: {
    bail: true,
    timeout: 6000,
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

// List all accounts.
task("accounts", "Prints accounts", async (_, { web3 }) => {
  const accounts = await ethers.provider.listAccounts();
  accounts.forEach((account) => console.log(account));
});

// List details of deployer account.
task(
  "account",
  "Get balance informations for the deployment account.",
  async (_, { ethers }) => {
    const hdkey = require("ethereumjs-wallet/hdkey");
    const bip39 = require("bip39");
    let mnemonic = fs.readFileSync("./mnemonic.txt").toString().trim();
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const hdwallet = hdkey.fromMasterSeed(seed);
    const wallet_hdpath = "m/44'/60'/0'/0/";
    const account_index = 0;
    let fullPath = wallet_hdpath + account_index;
    const wallet = hdwallet.derivePath(fullPath).getWallet();
    const privateKey = "0x" + wallet._privKey.toString("hex");
    var EthUtil = require("ethereumjs-util");
    const address =
      "0x" + EthUtil.privateToAddress(wallet._privKey).toString("hex");

    console.log("Deployer Account: " + address);
    for (let n in config.networks) {
      try {
        let provider = new ethers.providers.JsonRpcProvider(
          config.networks[n].url
        );
        let balance = await provider.getBalance(address);
        console.log(" -- " + n + " --  -- -- 📡 ");
        console.log("   balance: " + ethers.utils.formatEther(balance));
        console.log(
          "   nonce: " + (await provider.getTransactionCount(address))
        );
      } catch (e) {
        console.log(e);
      }
    }
  }
);
