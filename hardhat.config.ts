import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import * as taskNames from 'hardhat/builtin-tasks/task-names';
import fs from 'fs';
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import 'hardhat-contract-sizer';
import "solidity-coverage";
import 'solidity-docgen';

dotenv.config();

const defaultNetwork = 'hardhat';

function mnemonic() {
    try {
        return fs.readFileSync('./mnemonic.txt').toString().trim();
    } catch (e) {
        // if (defaultNetwork !== 'localhost') {
        console.log('☢️ WARNING: No mnemonic file created for a deploy account.');
        // }
    }
    return '';
}

const infuraId = process.env.INFURA_ID;

const config: HardhatUserConfig = {
    solidity: "0.8.6",
    defaultNetwork,
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
            chainId: 31337,
            blockGasLimit: 1_000_000_000
        },
        rinkeby: {
            url: `${process.env.RINKEBY_URL}/${process.env.ALCHEMY_RINKEBY_KEY}`,
            accounts: [`${process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000'}`]
        },
    },
    contractSizer: {
        alphaSort: true,
        disambiguatePaths: false,
        runOnCompile: true,
        strict: false
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: 'USD',
        gasPrice: 30,
        showTimeSpent: true,
        coinmarketcap: `${process.env.COINMARKETCAP_KEY}`
    },
    etherscan: {
        apiKey: `${process.env.ETHERSCAN_KEY}`,
    },
    mocha: {
        timeout: 30 * 60 * 1000,
        bail: false
    },
    docgen: {}
};

export default config;

// List details of deployer account.
task('account', 'Get balance information for the deployment account.', async (_, { ethers }) => {
    const hdkey = require('ethereumjs-wallet/hdkey');
    const bip39 = require('bip39');
    let mnemonic = fs.readFileSync('./mnemonic.txt').toString().trim();
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const hdwallet = hdkey.fromMasterSeed(seed);
    const wallet_hdpath = "m/44'/60'/0'/0/";
    const account_index = 0;
    let fullPath = wallet_hdpath + account_index;
    const wallet = hdwallet.derivePath(fullPath).getWallet();
    var EthUtil = require('ethereumjs-util');
    const address = '0x' + EthUtil.privateToAddress(wallet._privKey).toString('hex');

    console.log('Deployer Account: ' + address);
    if (config.networks == null) { return; }
    for (const n of Object.keys(config.networks)) {
        const nn: any = config.networks[n];
        try {
            let provider = new ethers.providers.JsonRpcProvider(nn.url);
            let balance = await provider.getBalance(address);
            console.log(' -- ' + n + ' --  -- -- 📡 ');
            console.log('   balance: ' + ethers.utils.formatEther(balance));
            console.log('   nonce: ' + (await provider.getTransactionCount(address)));
        } catch (e) {
            console.log(e);
        }
    }
});

task('compile:one', 'Compiles a single contract in isolation')
    .addPositionalParam('contractName')
    .setAction(async function (args, env) {
        const sourceName = env.artifacts.readArtifactSync(args.contractName).sourceName;

        const dependencyGraph = await env.run(taskNames.TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH, {
            sourceNames: [sourceName],
        });

        const resolvedFiles = dependencyGraph.getResolvedFiles().filter((resolvedFile: any) => {
            return resolvedFile.sourceName === sourceName;
        });

        const compilationJob = await env.run(
            taskNames.TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE,
            {
                dependencyGraph,
                file: resolvedFiles[0],
            },
        );

        await env.run(taskNames.TASK_COMPILE_SOLIDITY_COMPILE_JOB, {
            compilationJob,
            compilationJobs: [compilationJob],
            compilationJobIndex: 0,
            emitsArtifacts: true,
            quiet: true,
        });
    });

task('deploy-ballot', 'Deploy a buffer ballot of a given duration')
    .addParam('duration', 'Set the ballot duration (in seconds)')
    .setAction(async (taskArgs, hre) => {
        // try {
        //     const { get, deploy } = deployments;
        //     const [deployer] = await hre.ethers.getSigners();

        //     // Take the previously deployed
        //     const JBFundingCycleStoreDeployed = await get('JBFundingCycleStore');

        //     const JB3DayReconfigurationBufferBallot = await deploy('JBReconfigurationBufferBallot', {
        //         from: deployer.address,
        //         log: true,
        //         args: [taskArgs.duration, JBFundingCycleStoreDeployed.address],
        //     });

        //     console.log('Buffer ballot deployed at ' + JB3DayReconfigurationBufferBallot.address);
        // } catch (error) {
        //     console.log(error);
        // }
    });
