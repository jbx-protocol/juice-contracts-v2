import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';

import { deployContract, deployMockContract } from '../../../utils';

import addFeed from './add_feed';
import getEthPriceFor from './get_eth_price_for';

const contractName = 'Prices';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy a mock of the price feed oracle contract.
    this.aggregatorV3Contract = await deployMockContract(compilerOutput.abi);

    // Deploy the contract.
    this.contract = await deployContract(contractName);
  });

  // Test each function.
  describe('addFeed(...)', addFeed);
  describe('getETHPriceFor(...)', getEthPriceFor);
}
