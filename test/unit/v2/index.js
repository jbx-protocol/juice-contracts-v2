const shouldBehaveLike = require('./behaviors');

let snapshotId;
module.exports = function () {
  beforeEach(async function () {
    snapshotId = await this.snapshotFn();
    // Mark the start time of each test.
    await this.setTimeMarkFn();
  });
  // Test each contract.
  describe('JBOperatorStore', shouldBehaveLike.jbOperatorStore);

  // After each test, restore the contract state.
  afterEach(async function () {
    await this.restoreFn(snapshotId);
  });
};
