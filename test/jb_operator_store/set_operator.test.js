import { expect } from 'chai';
import { ethers } from 'hardhat';

import { makePackedPermissions } from '../helpers/utils';

describe('JBOperatorStore::setOperator(...)', function () {
  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let signers;

  beforeEach(async function () {
    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    signers = await ethers.getSigners();
  });

  async function setOperatorAndValidateEvent(
    operator,
    account,
    domain,
    permissionIndexes,
    packedPermissionIndexes,
  ) {
    const tx = await jbOperatorStore
      .connect(account)
      .setOperator([operator.address, domain, permissionIndexes]);

    await expect(tx)
      .to.emit(jbOperatorStore, 'SetOperator')
      .withArgs(
        operator.address,
        account.address,
        domain,
        permissionIndexes,
        packedPermissionIndexes,
      );

    expect(await jbOperatorStore.permissionsOf(operator.address, account.address, domain)).to.equal(
      packedPermissionIndexes,
    );
  }

  it('Set operator with no previous value, override it, and clear it', async function () {
    let caller = signers[0];
    let operator = signers[1];
    let domain = 1;
    let permissionIndexes = [1, 2, 3];
    let packedPermissions = makePackedPermissions(permissionIndexes);

    // Set the operator.
    await setOperatorAndValidateEvent(
      operator,
      /*account=*/ caller,
      domain,
      permissionIndexes,
      packedPermissions,
    );

    // Override the previously set value.
    permissionIndexes = [4, 5, 6];
    packedPermissions = makePackedPermissions(permissionIndexes);
    await setOperatorAndValidateEvent(
      operator,
      /*account=*/ caller,
      domain,
      permissionIndexes,
      packedPermissions,
    );

    // Clear previously set values.
    permissionIndexes = [];
    packedPermissions = makePackedPermissions(permissionIndexes);
    await setOperatorAndValidateEvent(
      operator,
      /*account=*/ caller,
      domain,
      permissionIndexes,
      packedPermissions,
    );
  });

  it('Index out of bounds', async function () {
    let caller = signers[0];
    let operator = signers[1];
    let domain = 1;
    let permissionIndexes = [1, 2, 256];

    await expect(
      jbOperatorStore.connect(caller).setOperator([operator.address, domain, permissionIndexes]),
    ).to.be.revertedWith('0x02: INDEX_OUT_OF_BOUNDS');
  });
});
