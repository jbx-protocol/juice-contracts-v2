const jbOperatorStore = require('./jb_operator_store');

let snapshotId;
module.exports = function () {
  beforeEach(async function () {
    snapshotId = await this.snapshotFn();
    // Mark the start time of each test.
    await this.setTimeMarkFn();
  });

  // Test each contract.
  describe('JBOperatorStore', jbOperatorStore);

  // After each test, restore the contract state.
  afterEach(async function () {
    await this.restoreFn(snapshotId);
  });
};
