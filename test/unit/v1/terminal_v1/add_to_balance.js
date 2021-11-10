import hardhat from 'hardhat';
const {
  ethers: { BigNumber },
} = hardhat;

import { expect } from 'chai';
import { getDeployer } from '../../../utils';

let deployer;

const tests = {
  success: [
    {
      description: 'add with no preset balance',
      fn: () => ({
        caller: deployer,
        projectId: 1,
        amount: BigNumber.from(1),
        expectation: {
          projectBalance: BigNumber.from(1),
        },
      }),
    },
    {
      description: 'add with preset balance',
      fn: () => ({
        caller: deployer,
        projectId: 1,
        amount: BigNumber.from(1),
        setup: {
          addToBalance: BigNumber.from(1),
        },
        expectation: {
          projectBalance: BigNumber.from(2),
        },
      }),
    },
  ],
  failure: [
    {
      description: 'zero amount',
      fn: () => ({
        caller: deployer,
        projectId: 1,
        amount: BigNumber.from(0),
        revert: 'TerminalV1::addToBalance: BAD_AMOUNT',
      }),
    },
  ],
};

export default function () {
  before(async function () {
    deployer = await getDeployer();
  });
  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        const {
          caller,
          projectId,
          amount,
          setup: { addToBalance } = {},
          expectation: { projectBalance, totalBalanceWithoutYield } = {},
        } = await successTest.fn(this);
        if (addToBalance) {
          await this.targetContract
            .connect(caller)
            .addToBalance(projectId, { value: addToBalance });
        }

        // Execute the transaction.
        const tx = await this.targetContract
          .connect(caller)
          .addToBalance(projectId, { value: amount });

        // Expect an event to have been emitted.
        await expect(tx)
          .to.emit(this.targetContract, 'AddToBalance')
          .withArgs(projectId, amount, caller.address);

        // Get the stored balance.
        const storedBalanceOf = await this.targetContract.balanceOf(projectId);

        // Get the total stored balance.
        const storedBalance = await this.deployer.provider.getBalance(this.targetContract.address);

        // Expect the stored value to equal whats expected.
        expect(storedBalanceOf).to.equal(projectBalance);

        // Expect the stored value to equal whats expected.
        expect(storedBalance.amountWithoutYield).to.equal(totalBalanceWithoutYield);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, projectId, amount, revert } = await failureTest.fn(this);
        await expect(
          this.targetContract.connect(caller).addToBalance(projectId, { value: amount }),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
