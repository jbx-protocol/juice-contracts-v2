const shouldBehaveLike = require('./behaviors');

let snapshotId;
module.exports = function () {
  beforeEach(async function () {
    snapshotId = await this.snapshotFn();
    // Mark the start time of each test.
    await this.setTimeMarkFn();
  });
  // Test each contract.
  describe('JBDirectory', shouldBehaveLike.jbDirectory);
  describe('JBETHPaymentTerminal', shouldBehaveLike.jbEthPaymentTerminal);
  describe('JBFundingCycleStore', shouldBehaveLike.jbFundingCycleStore);
  describe('JBOperatorStore', shouldBehaveLike.jbOperatorStore);
  describe('JBPrices', shouldBehaveLike.jbPrices);
  describe('JBSplitStore', shouldBehaveLike.jbSplitStore);
  describe('JBToken', shouldBehaveLike.jbToken);
  describe('JBTokenStore', shouldBehaveLike.jbTokenStore);
  // TODO(odd-amphora): Dependencies – also... why are they needed?

  // After each test, restore the contract state.
  afterEach(async function () {
    await this.restoreFn(snapshotId);
  });
};
