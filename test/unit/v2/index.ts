const jbOperatorStore = require('./jb_operator_store');
const jbPrices = require('./jb_prices');

let snapshotId;
export default function () {
  beforeEach(async function () {
    snapshotId = await this.snapshotFn();
    // Mark the start time of each test.
    await this.setTimeMarkFn();
  });

  // Test each contract.
  describe('JBOperatorStore', jbOperatorStore);
  describe('JBPrices', jbPrices);

  // After each test, restore the contract state.
  afterEach(async function () {
    await this.restoreFn(snapshotId);
  });
};
