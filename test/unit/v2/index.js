import { snapshot as takeSnapshot } from '@openzeppelin/test-helpers';

import jbOperatorStore from './jb_operator_store';
import jbPrices from './jb_prices';

let snapshot;
export default function () {
  beforeEach(async function () {
    snapshot = await takeSnapshot();
    // Mark the start time of each test.
    //await this.setTimeMarkFn();
  });

  // Test each contract.
  describe('JBOperatorStore', jbOperatorStore);
  describe('JBPrices', jbPrices);

  // After each test, restore the contract state.
  afterEach(async function () {
    await snapshot.restore();
  });
}
