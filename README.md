# juice-contracts-v2

## Develop

To deploy the contracts to a local blockchain, run the following:

```bash
yarn chain --network hardhat
```

To run tests:

```bash
yarn test
```

### Coverage

To check current test coverage:

```bash
node --require esm ./node_modules/.bin/hardhat coverage --network hardhat
```

A few notes:
* Hardhat doesn't support [esm](https://nodejs.org/api/esm.html) yet, hence running manually with node.
* We are currently using a forked version of [solidity-coverage](https://www.npmjs.com/package/solidity-coverage) that includes optimizer settings. Ideally we will move to the maintained version after this is fixed on their end.

## Deploy

Juicebox uses the [Hardhat Deploy](https://github.com/wighawag/hardhat-deploy) plugin to deploy contracts to a given network. But before using it, you must create a `./mnemonic.txt` file containing the mnemonic phrase of the wallet used to deploy. You can generate a new mnemonic using [this tool](https://github.com/itinance/mnemonics). Generate a mnemonic at your own risk.

Then, to execute the `./deploy/deploy.js` script, run the following:

```bash
npx hardhat deploy --network $network
```

Contract artifacts will be outputted to `./deployments/$network/**` and should be checked in to the repo.

> **_NOTE:_**  Since we make heavy use of the `skipIfAlreadyDeployed` parameter, if new contract(s) are added, their deployment configuration(s) should be added to the `./deploy/deploy.js` script – not a one-off.

## Verification

To verify the contracts on [Etherscan](https://etherscan.io), make sure you have an `ETHERSCAN_API_KEY` set in your `./.env` file. Then run the following:

```bash
npx hardhat --network $network etherscan-verify
```

This will verify all of the deployed contracts in `./deployments`.
