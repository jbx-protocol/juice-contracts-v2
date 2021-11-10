import { ethers } from 'hardhat';
import { expect } from 'chai';

import { getAddresses, getDeployer } from "../../../utils"

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'set operators, no previously set values',
      fn: () => ({
        caller: deployer,
        setOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [42, 41, 255],
          },
        ],
        expectOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [42, 41, 255],
          },
        ],
      }),
    },
    {
      description: 'set operators, overriding previously set values',
      fn: () => ({
        caller: deployer,
        domains: [1, 1],
        operators: [addrs[0], addrs[1]],
        permissionIndexes: {
          pre: [[33], [23]],
          set: [[42, 41, 255], [3]],
          expect: [[42, 41, 255], [3]],
        },
        presetOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [33],
          },
          {
            operator: addrs[1],
            domain: 1,
            permissionIndexes: [23],
          },
        ],
        setOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [42, 41, 255],
          },
          {
            operator: addrs[1],
            domain: 1,
            permissionIndexes: [3],
          },
        ],
        expectOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [42, 41, 255],
          },
          {
            operator: addrs[1],
            domain: 1,
            permissionIndexes: [3],
          },
        ],
      }),
    },
    {
      description: 'set operators, clearing any previously set values',
      fn: () => ({
        caller: deployer,
        presetOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [33],
          },
          {
            operator: addrs[1],
            domain: 1,
            permissionIndexes: [33],
          },
        ],
        setOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [],
          },
          {
            operator: addrs[1],
            domain: 1,
            permissionIndexes: [],
          },
        ],
        expectOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [],
          },
          {
            operator: addrs[1],
            domain: 1,
            permissionIndexes: [],
          },
        ],
      }),
    },
    {
      description: 'set operators, with the same operator used for two different projects',
      fn: () => ({
        caller: deployer,
        setOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [42, 41, 255],
          },
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [4, 255, 3],
          },
        ],
        expectOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [42, 41, 255],
          },
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [4, 255, 3],
          },
        ],
      }),
    },
    {
      description: 'set operators, with the same operator used for the same project',
      fn: () => ({
        caller: deployer,
        setOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [42, 41, 255],
          },
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [4, 255, 3],
          },
        ],
        expectOperators: [
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [4, 255, 3],
          },
          {
            operator: addrs[0],
            domain: 0,
            permissionIndexes: [4, 255, 3],
          },
        ],
      }),
    },
    {
      description: 'set only one operator',
      fn: () => ({
        caller: deployer,
        domains: [1],
        operators: [addrs[0]],
        permissionIndexes: {
          set: [[42, 41, 255]],
          expect: [[42, 41, 255]],
        },
        setOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [42, 41, 255],
          },
        ],
        expectOperators: [
          {
            operator: addrs[0],
            domain: 1,
            permissionIndexes: [42, 41, 255],
          },
        ],
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
        const { caller, presetOperators, setOperators, expectOperators } = successTest.fn(this);

        // If specified, pre-set an operator before the rest of the test.
        if (presetOperators) {
          await this.contract
            .connect(caller)
            .setOperators(
              presetOperators.map((o) => [o.operator.address, o.domain, o.permissionIndexes]),
            );
        }

        // Execute the transaction
        const tx = await this.contract
          .connect(caller)
          .setOperators(
            setOperators.map((o) => [o.operator.address, o.domain, o.permissionIndexes]),
          );

        // For each operator...
        await Promise.all(
          expectOperators.map(async (o, i) => {
            // Calculate the expected packed values once the permissions are set.
            const expectedPackedPermissions = o.permissionIndexes.reduce(
              (sum, index) => sum.add(ethers.BigNumber.from(2).pow(index)),
              ethers.BigNumber.from(0),
            );

            // Expect an event to be emitted.
            expect(tx)
              .to.emit(this.contract, 'SetOperator')
              .withArgs(
                o.operator.address,
                caller.address,
                o.domain,
                o.permissionIndexes,
                expectedPackedPermissions,
              );

            // Get the stored packed permissions values.
            const storedPackedPermissions = await this.contract.permissionsOf(
              o.operator.address,
              caller.address,
              o.domain,
            );
            // Expect the packed values to match.
            expect(storedPackedPermissions).to.equal(expectedPackedPermissions);
          }),
        );
      });
    });
  });
}
