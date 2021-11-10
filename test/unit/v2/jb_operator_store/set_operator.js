import { ethers } from 'hardhat';
import { expect } from 'chai';
import { getAddresses, getDeployer } from '../../../utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'set operator, no previously set value',
      fn: () => ({
        caller: deployer,
        setOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [42, 41, 255],
        },
        expectOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [42, 41, 255],
        },
      }),
    },
    {
      description: 'set operator, overriding previously set value',
      fn: () => ({
        caller: deployer,
        presetOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [33],
        },
        setOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [42, 41, 255],
        },
        expectOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [42, 41, 255],
        },
      }),
    },
    {
      description: 'set operator, clearing any previously set value',
      fn: () => ({
        caller: deployer,
        presetOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [33],
        },
        setOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [],
        },
        expectOperator: {
          operator: addrs[0],
          domain: 1,
          permissionIndexes: [],
        },
      }),
    },
  ],
  failure: [
    {
      description: 'index out of bounds',
      fn: () => ({
        caller: deployer,
        setOperator: {
          operator: addrs[0],
          domain: 0,
          permissionIndexes: [256],
        },
        revert: '0x02: INDEX_OUT_OF_BOUNDS',
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
        const { caller, presetOperator, setOperator, expectOperator } = successTest.fn(this);

        // If specified, pre-set an operator before the rest of the test.
        if (presetOperator) {
          await this.contract
            .connect(caller)
            .setOperator([
              presetOperator.operator.address,
              presetOperator.domain,
              presetOperator.permissionIndexes,
            ]);
        }

        // Calculate the expected packed value once the permissions are set.
        const expectedPackedPermissions = expectOperator.permissionIndexes.reduce(
          (sum, i) => sum.add(ethers.BigNumber.from(2).pow(i)),
          ethers.BigNumber.from(0),
        );

        // Execute the transaction.
        const tx = await this.contract
          .connect(caller)
          .setOperator([
            setOperator.operator.address,
            setOperator.domain,
            setOperator.permissionIndexes,
          ]);

        // Expect an event to have been emitted.
        await expect(tx)
          .to.emit(this.contract, 'SetOperator')
          .withArgs(
            expectOperator.operator.address,
            caller.address,
            expectOperator.domain,
            expectOperator.permissionIndexes,
            expectedPackedPermissions,
          );

        // Get the stored packed permissions value.
        const storedPackedPermissions = await this.contract.permissionsOf(
          setOperator.operator.address,
          caller.address,
          setOperator.domain,
        );

        // Expect the packed values to match.
        expect(storedPackedPermissions).to.equal(expectedPackedPermissions);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { caller, setOperator, revert } = failureTest.fn(this);
        await expect(
          this.contract
            .connect(caller)
            .setOperator([
              setOperator.operator.address,
              setOperator.domain,
              setOperator.permissionIndexes,
            ]),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
