import { expect } from 'chai';

const tests = {
  success: [
    {
      description: 'target decimals should be 18',
      target: 18,
    },
  ],
};

module.exports = function () {
  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        // Expect the target decimals should match.
        expect(await this.contract.TARGET_DECIMALS()).to.equal(successTest.target);
      });
    });
  });
};
