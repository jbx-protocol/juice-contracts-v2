# juice-contracts

This repo contains the Juicebox Protocol smart contracts.

It was created at the time of the `V2` rewrite, which requires a full migration from `V1`. `V1` contracts are included for migration tests and posterity, but in general the repo is geared towards `V2` and beyond.

## Deploy

Juicebox uses the [Hardhat Deploy](https://github.com/wighawag/hardhat-deploy) plugin to deploy contracts to a given network. But before using it, you must create a `./mnemonic.txt` file containing the mnemonic phrase of the wallet used to deploy.

Then, to execute the `./deploy/deploy.js` script, run the following:

```
npx hardhat deploy --network $network
```

Contract artifacts will be outputted to `./deployments/$network/**` and should be checked in to the repo.

> **_NOTE:_**  Since we make heavy use of the `skipIfAlreadyDeployed` parameter, if new contract(s) are added, their deployment configuration(s) should be added to the `./deploy/deploy.js` script – not a one-off.

## Verification

To verify the contracts on [Etherscan](https://etherscan.io), make sure you have an `ETHERSCAN_API_KEY` set in your `./.env` file. Then run the following:

```
npx hardhat --network $network etherscan-verify
```

This will verify all of the deployed contracts in `./deployments`.
