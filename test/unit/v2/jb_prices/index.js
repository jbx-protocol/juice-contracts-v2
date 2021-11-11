import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';

import { deployContract, deployMockContract, getDeployer } from '../../../helpers/utils';

import addFeedFor from './add_feed_for';
import priceFor from './price_for';
import targetDecimals from './target_decimals';

export default function () {
  before(async function () {
    // Deploy a mock of the price feed oracle contract.
    this.aggregatorV3Contract = await deployMockContract(compilerOutput.abi);

    this.contract = await deployContract('JBPrices', [(await getDeployer()).address]);
  });

  describe('addFeedFor(...)', addFeedFor);
  describe('priceFor(...)', priceFor);
  describe('targetDecimals(...)', targetDecimals);
}
