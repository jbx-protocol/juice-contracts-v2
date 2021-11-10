import hardhat from 'hardhat';
const {
  ethers: { utils },
} = hardhat;
import { expect } from 'chai';

import { deployMockLocalContract, getAddresses, getDeployer } from '../../../utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'transfers ownership',
      fn: () => ({
        caller: deployer,
        newOwner: addrs[0].address,
        projectId: 1,
      }),
    },
  ],
  failure: [
    {
      description: 'unauthorized',
      fn: () => ({
        caller: addrs[0].address,
        newOwner: addrs[0].address,
        projectId: 1,
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
        const { caller, newOwner, projectId } = successTest.fn(this);

        const operatorStore = await deployMockLocalContract('OperatorStore');
        const projects = await deployMockLocalContract('Projects', [operatorStore.address]);

        const data = utils.formatBytes32String('some-data');

        await projects.mock.safeTransferFrom
          .withArgs(this.contract.address, newOwner, projectId, data)
          .returns();

        // Execute the transaction.
        await this.contract
          .connect(caller)
          .transferProjectOwnership(projects.address, newOwner, projectId, data);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, newOwner, projectId, revert } = failureTest.fn(this);

        const operatorStore = await deployMockLocalContract('OperatorStore');
        const projects = await deployMockLocalContract('Projects', [operatorStore.address]);

        const data = utils.formatBytes32String('some-data');

        // Execute the transaction.
        await expect(
          this.contract
            .connect(caller)
            .transferProjectOwnership(projects.address, newOwner, projectId, data),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
