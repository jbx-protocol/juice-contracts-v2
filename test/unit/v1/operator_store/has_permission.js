import { expect } from 'chai';
import { getAddresses, getDeployer } from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'has permission, account is caller',
      fn: () => ({
        set: {
          caller: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndexes: [42, 41, 255],
        },
        check: {
          caller: deployer,
          account: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndex: 42,
        },
        result: true,
      }),
    },
    {
      description: 'has permission, account is not caller',
      fn: () => ({
        set: {
          caller: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndexes: [7],
        },
        check: {
          caller: addrs[1],
          account: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndex: 7,
        },
        result: true,
      }),
    },
    {
      description: 'doesnt have permission, never set',
      fn: () => ({
        check: {
          caller: deployer,
          account: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndex: 42,
        },
        result: false,
      }),
    },
    {
      description: 'doesnt have permission, indexes differ',
      fn: () => ({
        set: {
          caller: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndexes: [1, 2, 3],
        },
        check: {
          caller: deployer,
          account: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndex: 42,
        },
        result: false,
      }),
    },
    {
      description: 'doesnt have permission, domain differs',
      fn: () => ({
        set: {
          caller: deployer,
          domain: 1,
          operator: addrs[0],
          permissionIndexes: [42],
        },
        check: {
          caller: deployer,
          account: deployer,
          domain: 0,
          operator: addrs[0],
          permissionIndex: 42,
        },
        result: false,
      }),
    },
  ],
  failure: [
    {
      description: 'index out of bounds',
      fn: () => ({
        check: {
          caller: deployer,
          account: deployer,
          domain: 0,
          operator: addrs[0],
          permissionIndex: 256,
        },
        revert: 'OperatorStore::hasPermission: INDEX_OUT_OF_BOUNDS',
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
        const { set, check, result } = successTest.fn(this);

        // If specified, set an operator before the rest of the test.
        if (set) {
          await this.contract
            .connect(set.caller)
            .setOperator(set.operator.address, set.domain, set.permissionIndexes);
        }

        // Check for permissions.
        const flag = await this.contract
          .connect(check.caller)
          .hasPermission(
            check.operator.address,
            check.account.address,
            check.domain,
            check.permissionIndex,
          );

        expect(flag).to.equal(result);
      });
    });
  });
  describe('Failure cases', function () {
    tests.failure.forEach(function (failureTest) {
      it(failureTest.description, async function () {
        const { check, revert } = failureTest.fn(this);
        await expect(
          this.contract
            .connect(check.caller)
            .hasPermission(
              check.operator.address,
              check.account.address,
              check.domain,
              check.permissionIndex,
            ),
        ).to.be.revertedWith(revert);
      });
    });
  });
}
