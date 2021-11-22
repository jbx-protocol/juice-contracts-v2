import { expect } from 'chai';
import { ethers } from 'hardhat';

import { makePackedPermissions } from '../helpers/utils';

describe(`JBOperatorStore::setOperators(...)`, function () {
  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let signers;

  beforeEach(async function () {
    jbOperatorStoreFactory = await ethers.getContractFactory(`JBOperatorStore`);
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    signers = await ethers.getSigners();
  });

  async function setOperatorsAndValidateEvent(
    operators,
    account,
    domain,
    permissionIndexes,
    packedPermissionIndexes,
  ) {
    const tx = await jbOperatorStore
      .connect(account)
      .setOperators(operators.map((operator) => [operator.address, domain, permissionIndexes]));

    await Promise.all(
      operators.map(async (operator, _) => {
        await expect(tx)
          .to.emit(jbOperatorStore, 'SetOperator')
          .withArgs(
            operator.address,
            account.address,
            domain,
            permissionIndexes,
            packedPermissionIndexes,
          );

        expect(
          await jbOperatorStore.permissionsOf(operator.address, account.address, domain),
        ).to.equal(packedPermissionIndexes);
      }),
    );
  }

  it(`Set operators with no previous value, override it, and clear it`, async function () {
    let caller = signers[0];
    let operators = [signers[1], signers[2], signers[3]];
    let domain = 1;
    let permissionIndexes = [1, 2, 3];
    let packedPermissions = makePackedPermissions(permissionIndexes);

    // Set the operator.
    await setOperatorsAndValidateEvent(
      operators,
      /*account=*/ caller,
      domain,
      permissionIndexes,
      packedPermissions,
    );

    // Override the previously set value.
    permissionIndexes = [4, 5, 6];
    packedPermissions = makePackedPermissions(permissionIndexes);
    await setOperatorsAndValidateEvent(
      operators,
      /*account=*/ caller,
      domain,
      permissionIndexes,
      packedPermissions,
    );

    // Clear previously set values.
    permissionIndexes = [];
    packedPermissions = makePackedPermissions(permissionIndexes);
    await setOperatorsAndValidateEvent(
      operators,
      /*account=*/ caller,
      domain,
      permissionIndexes,
      packedPermissions,
    );
  });

  it(`Set operators with same operator used for two different projects`, async function () {
    // TODO(odd-amphora)
  });

  it(`set operators, with the same operator used for the same project`, async function () {
    // TODO(odd-amphora)
  });
});
