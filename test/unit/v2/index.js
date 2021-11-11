import jbOperatorStore from './jb_operator_store';
import jbPrices from './jb_prices';

import { snapshot, restore } from '../../helpers/utils';

let snapshotId;
export default function () {
  beforeEach(async function () {
    snapshotId = await snapshot();
    // Mark the start time of each test.
    await this.setTimeMarkFn();
  });

  // Test each contract.
  describe('JBOperatorStore', jbOperatorStore);
  describe('JBPrices', jbPrices);

  // After each test, restore the contract state.
  afterEach(async function () {
    await restore(snapshotId);
  });
}
