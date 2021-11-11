import { expect } from 'chai';

import { deployMockLocalContract, getAddresses, getDeployer } from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'sets operator',
      fn: () => ({
        caller: deployer,
        projectId: 1,
        operator: addrs[0].address,
        permissionIndexes: [1],
      }),
    },
  ],
  failure: [
    {
      description: 'unauthorized',
      fn: () => ({
        caller: addrs[0].address,
        projectId: 1,
        operator: addrs[0].address,
        permissionIndexes: [1],
        revert: 'Ownable: caller is not the owner',
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
        const { caller, projectId, operator, permissionIndexes } = successTest.fn(this);

        const operatorStore = await deployMockLocalContract('OperatorStore');

        await operatorStore.mock.setOperator
          .withArgs(operator, projectId, permissionIndexes)
          .returns();

        // Execute the transaction.
        await this.contract
          .connect(caller)
          .setOperator(operatorStore.address, operator, projectId, permissionIndexes);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, projectId, operator, permissionIndexes, revert } = failureTest.fn(this);

        const operatorStore = await deployMockLocalContract('OperatorStore');

        await operatorStore.mock.setOperator
          .withArgs(operator, projectId, permissionIndexes)
          .returns();

        // Execute the transaction.
        await expect(
          this.contract
            .connect(caller)
            .setOperator(operatorStore.address, operator, projectId, permissionIndexes),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
