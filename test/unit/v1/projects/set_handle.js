import { ethers } from 'hardhat';
import { expect } from 'chai';

import { constants, getAddresses, getDeployer } from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'different handle',
      fn: () => ({
        caller: deployer,
        handle: ethers.utils.formatBytes32String('some-handle'),
        setup: {
          create: {
            owner: deployer.address,
            handle: ethers.utils.formatBytes32String('some-old-handle'),
          },
        },
      }),
    },
    {
      description: 'called by operator',
      fn: () => ({
        caller: deployer,
        handle: ethers.utils.formatBytes32String('some-handle'),
        setup: {
          create: {
            owner: addrs[0].address,
            handle: ethers.utils.formatBytes32String('some-old-handle'),
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
        handle: ethers.utils.formatBytes32String('some-handle'),
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
    {
      description: 'no handle',
      fn: () => ({
        caller: deployer,
        handle: ethers.utils.formatBytes32String(''),
        setup: {
          create: {
            owner: deployer.address,
            handle: ethers.utils.formatBytes32String('some-old-handle'),
          },
        },
        revert: 'Projects::setHandle: EMPTY_HANDLE',
      }),
    },
    {
      description: 'handle taken',
      fn: () => ({
        caller: deployer,
        handle: ethers.utils.formatBytes32String('some-handle'),
        setup: {
          create: {
            owner: deployer.address,
            handle: ethers.utils.formatBytes32String('some-handle'),
          },
        },
        revert: 'Projects::setHandle: HANDLE_TAKEN',
      }),
    },
    {
      description: 'handle being transfered',
      fn: () => ({
        caller: deployer,
        handle: ethers.utils.formatBytes32String('some-handle'),
        setup: {
          create: {
            owner: deployer.address,
            handle: ethers.utils.formatBytes32String('some-handle'),
          },
          transfer: {
            owner: deployer.address,
            to: addrs[0].address,
            handle: ethers.utils.formatBytes32String('some-new-handle'),
          },
        },
        revert: 'Projects::setHandle: HANDLE_TAKEN',
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
        const { caller, handle, setup: { create, permissionFlag } = {} } = successTest.fn(this);

        // Setup by creating a project.
        await this.contract
          .connect(caller)
          .create(create.owner, create.handle, '', constants.AddressZero);
        if (permissionFlag !== undefined) {
          const permissionIndex = 5;

          // Mock the caller to be the project's controller.
          await this.operatorStore.mock.hasPermission
            .withArgs(caller.address, create.owner, 1, permissionIndex)
            .returns(permissionFlag);
        }

        // Execute the transaction.
        const tx = await this.contract.connect(caller).setHandle(1, handle);

        // Expect an event to have been emitted.
        expect(tx).to.emit(this.contract, 'SetHandle').withArgs(1, handle, caller.address);

        // Get the stored handle value.
        const storedHandle = await this.contract.handleOf(1);

        // Get the stored project value.
        const storedProject = await this.contract.projectFor(handle);

        // Expect the stored values to equal the set values.
        expect(storedHandle).to.equal(handle);
        expect(storedProject).to.equal(1);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const {
          caller,
          handle,
          setup: { create, transfer, permissionFlag } = {},
          revert,
        } = failureTest.fn(this);

        // Setup by creating a project.
        await this.contract
          .connect(caller)
          .create(create.owner, create.handle, '', constants.AddressZero);
        if (transfer) {
          await this.contract.connect(caller).transferHandle(1, transfer.to, transfer.handle);
        }
        if (permissionFlag !== undefined) {
          const permissionIndex = 5;

          // Mock the caller to be the project's controller.
          await this.operatorStore.mock.hasPermission
            .withArgs(caller.address, create.owner, 1, permissionIndex)
            .returns(permissionFlag);
        }

        // Execute the transaction.
        await expect(this.contract.connect(caller).setHandle(1, handle)).to.be.revertedWith(revert);
      });
    });
  });
}
