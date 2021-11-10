import { ethers } from 'hardhat';
import { expect } from 'chai';

import { constants, getAddresses, getDeployer } from '../../../utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'called by owner',
      fn: () => ({
        caller: deployer,
        setup: {
          create: {
            owner: deployer.address,
            handle: ethers.utils.formatBytes32String('some-handle'),
          },
        },
      }),
    },
    {
      description: 'called by operator',
      fn: () => ({
        caller: deployer,
        setup: {
          create: {
            owner: addrs[1].address,
            handle: ethers.utils.formatBytes32String('some-handle'),
          },
          permissionFlag: true,
        },
      }),
    },
  ],
  failure: [
    {
      description: 'unauthorized',
      fn: () => ({
        caller: deployer,
        setup: {
          create: {
            owner: addrs[0].address,
            handle: ethers.utils.formatBytes32String('some-old-handle'),
          },
          permissionFlag: false,
        },
        revert: 'Operatable: UNAUTHORIZED',
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
        const { caller, setup: { create, permissionFlag } = {} } = successTest.fn(this);

        // Setup by creating a project.
        await this.contract
          .connect(caller)
          .create(create.owner, create.handle, '', constants.AddressZero);

        // Challenge the handle.
        await this.contract.connect(caller).challengeHandle(create.handle);

        if (permissionFlag !== undefined) {
          const permissionIndex = 8;

          // Mock the caller to be the project's controller.
          await this.operatorStore.mock.hasPermission
            .withArgs(caller.address, create.owner, 1, permissionIndex)
            .returns(permissionFlag);
        }

        // Execute the transaction.
        const tx = await this.contract.connect(caller).renewHandle(1);

        // Expect an event to have been emitted.
        expect(tx).to.emit(this.contract, 'RenewHandle').withArgs(create.handle, 1, caller.address);

        // Get the stored reverse handle lookup value.
        const storedchallengeExpiryOf = await this.contract.challengeExpiryOf(create.handle);

        // Expect the stored value to be zero.
        expect(storedchallengeExpiryOf).to.equal(0);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, setup: { create, permissionFlag } = {}, revert } = failureTest.fn(this);

        // Setup by creating a project.
        await this.contract
          .connect(caller)
          .create(create.owner, create.handle, '', constants.AddressZero);

        // Challenge the handle.
        await this.contract.connect(caller).challengeHandle(create.handle);

        if (permissionFlag !== undefined) {
          const permissionIndex = 8;

          // Mock the caller to be the project's controller.
          await this.operatorStore.mock.hasPermission
            .withArgs(caller.address, create.owner, 1, permissionIndex)
            .returns(permissionFlag);
        }

        // Execute the transaction.
        await expect(this.contract.connect(caller).renewHandle(1)).to.be.revertedWith(revert);
      });
    });
  });
}
