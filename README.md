# juice-contracts

This repo contains the Juicebox Protocol smart contracts.

It was created at the time of the `V2` rewrite, which requires a full migration from `V1`. `V1` contracts are included for migration tests and posterity, but in general the repo is geared towards `V2` and beyond.

## Develop

To deploy the contracts to a local blockchain, run the following:

```bash
yarn chain --network hardhat
```

To run tests (all, unit, integration):

```bash
yarn test
yarn test:unit
yarn test:integration
```

Yo can also filter by version, test name, etc.:

```bash
yarn test:unit --grep "ProxyPaymentAddressManager"
```

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
