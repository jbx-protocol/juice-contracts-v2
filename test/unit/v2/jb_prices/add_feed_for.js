import { expect } from 'chai';
import { getAddresses, getDeployer } from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'add feed',
      fn: () => ({
        caller: deployer,
        set: {
          currency: 1,
          base: 2,
        },
      }),
    },
  ],
  failure: [
    {
      description: 'not owner',
      fn: () => ({
        caller: addrs[0],
        set: {
          currency: 1,
          base: 2,
        },
        decimals: 18,
        revert: 'Ownable: caller is not the owner',
      }),
    },
    {
      description: 'already exists',
      fn: () => ({
        caller: deployer,
        preset: {
          currency: 1,
          base: 2,
        },
        set: {
          currency: 1,
          base: 2,
        },
        decimals: 18,
        revert: '0x04: ALREADY_EXISTS',
      }),
    },
  ],
};

export default function () {
  before(async function () {
    deployer = await getDeployer();
    addrs = await getAddresses();
  });

  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        const { caller, set } = successTest.fn(this);

        // Execute the transaction.
        const tx = await this.contract
          .connect(caller)
          .addFeedFor(set.currency, set.base, this.aggregatorV3Contract.address);

        // Expect an event to have been emitted.
        await expect(tx)
          .to.emit(this.contract, 'AddFeed')
          .withArgs(set.currency, set.base, this.aggregatorV3Contract.address);

        // Get the stored feed.
        const storedFeed = await this.contract.feedFor(set.currency, set.base);

        // Expect the stored feed values to match.
        expect(storedFeed).to.equal(this.aggregatorV3Contract.address);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, preset, set, revert } = failureTest.fn(this);

        if (preset) {
          await this.contract
            .connect(caller)
            .addFeedFor(preset.currency, preset.base, this.aggregatorV3Contract.address);
        }

        await expect(
          this.contract
            .connect(caller)
            .addFeedFor(set.currency, set.base, this.aggregatorV3Contract.address),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
