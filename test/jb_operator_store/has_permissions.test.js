import { expect } from 'chai';
import { ethers } from 'hardhat';

describe(`JBOperatorStore::hasPermission(...)`, function () {
  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let signers;

  beforeEach(async function () {
    jbOperatorStoreFactory = await ethers.getContractFactory(`JBOperatorStore`);
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    signers = await ethers.getSigners();
  });

  it(`Permission index out of bounds`, async function () {
    await expect(
      jbOperatorStore
        .connect(signers[0])
        .hasPermissions(
          /*operator=*/ signers[0].address,
          /*account=*/ signers[0].address,
          /*domain=*/ 1,
          /*permissionIndexes=*/ [256],
        ),
    ).to.be.revertedWith(`0x01: INDEX_OUT_OF_BOUNDS`);
  });

  it(`Has permissions, account is caller`, async function () {
    let caller = signers[0];
    let operator = signers[1];
    let domain = 1;
    let permissionIndexes = [1, 2, 3];

    await jbOperatorStore
      .connect(caller)
      .setOperator([operator.address, domain, permissionIndexes]);

    expect(
      await jbOperatorStore
        .connect(caller)
        .hasPermissions(operator.address, /*account=*/ caller.address, domain, permissionIndexes),
    ).to.be.true;
  });

  it('Has permissions, account is not caller', async function () {
    let caller1 = signers[0];
    let caller2 = signers[1];

    let operator = signers[2];
    let domain = 1;
    let permissionIndexes = [1, 2, 3];

    await jbOperatorStore
      .connect(caller1)
      .setOperator([operator.address, domain, permissionIndexes]);

    expect(
      await jbOperatorStore
        .connect(caller2)
        .hasPermissions(operator.address, /*account=*/ caller1.address, domain, permissionIndexes),
    ).to.be.true;
  });

  it(`Doesn't have permissions, never set`, async function () {
    expect(
      await jbOperatorStore
        .connect(signers[0])
        .hasPermissions(
          /*operator=*/ signers[1].address,
          /*account=*/ signers[0].address,
          /*domain=*/ 1,
          /*permissionIndexes=*/ [3],
        ),
    ).to.be.false;
  });

  it(`Doesn't have permission, indexes differ`, async function () {
    let caller = signers[0];
    let operator = signers[1];
    let domain = 1;

    await jbOperatorStore
      .connect(caller)
      .setOperator([operator.address, domain, /*permissionIndexes=*/ [1, 2, 3]]);

    // Test some invalid permission indexes, with some overlapping.
    expect(
      await jbOperatorStore
        .connect(caller)
        .hasPermissions(operator.address, /*account=*/ caller.address, domain, [2, 3, 4]),
    ).to.be.false;
  });

  it(`Doesn't have permission, domain differs`, async function () {
    let caller = signers[0];
    let operator = signers[1];
    let permissionIndexes = [1, 2, 3];

    await jbOperatorStore
      .connect(caller)
      .setOperator([operator.address, /*domain=*/ 1, permissionIndexes]);

    expect(
      await jbOperatorStore.connect(caller).hasPermissions(
        operator.address,
        /*account=*/ caller.address,
        /*domain=*/ 2, // Test different domain.
        permissionIndexes,
      ),
    ).to.be.false;
  });
});
