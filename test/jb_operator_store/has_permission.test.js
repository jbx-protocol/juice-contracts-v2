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
        .hasPermission(
          /*operator=*/ signers[0].address,
          /*account=*/ signers[0].address,
          /*domain=*/ 1,
          /*permissionIndex=*/ 256,
        ),
    ).to.be.revertedWith(`0x00: INDEX_OUT_OF_BOUNDS`);
  });

  it(`Has permission if account is caller`, async function () {
    let caller = signers[0];
    let operator = signers[1];
    let domain = 1;
    let permissionIndexes = [1, 2, 3];

    await jbOperatorStore
      .connect(caller)
      .setOperator([operator.address, domain, permissionIndexes]);

    for (let permissionIndex of permissionIndexes) {
      expect(
        await jbOperatorStore
          .connect(caller)
          .hasPermission(operator.address, /*account=*/ caller.address, domain, permissionIndex),
      ).to.be.true;
    }
  });

  it('Has permission if account is not caller', async function () {
    let caller1 = signers[0];
    let caller2 = signers[1];

    let operator = signers[2];
    let domain = 1;
    let permissionIndexes = [1, 2, 3];

    await jbOperatorStore
      .connect(caller1)
      .setOperator([operator.address, domain, permissionIndexes]);

    for (let permissionIndex of permissionIndexes) {
      expect(
        await jbOperatorStore
          .connect(caller2)
          .hasPermission(operator.address, /*account=*/ caller1.address, domain, permissionIndex),
      ).to.be.true;
    }
  });

  it(`Doesn't have permission if never set`, async function () {
    expect(
      await jbOperatorStore
        .connect(signers[0])
        .hasPermission(
          /*operator=*/ signers[1].address,
          /*account=*/ signers[0].address,
          /*domain=*/ 1,
          /*permissionIndex=*/ 3,
        ),
    ).to.be.be.false;
  });

  it(`Doesn't have permission if indexes differ`, async function () {
    let caller = signers[0];
    let operator = signers[1];
    let domain = 1;

    await jbOperatorStore
      .connect(caller)
      .setOperator([operator.address, domain, /*permissionIndexes=*/ [1, 2, 3]]);

    // Test some invalid permission indexes.
    for (let permissionIndex of [4, 5, 6]) {
      expect(
        await jbOperatorStore
          .connect(caller)
          .hasPermission(operator.address, /*account=*/ caller.address, domain, permissionIndex),
      ).to.be.false;
    }
  });

  it(`Doesn't have permission if domain differs`, async function () {
    let caller = signers[0];
    let operator = signers[1];
    let permissionIndexes = [1, 2, 3];

    await jbOperatorStore
      .connect(caller)
      .setOperator([operator.address, /*domain=*/ 1, permissionIndexes]);

    for (let permissionIndex of permissionIndexes) {
      expect(
        await jbOperatorStore.connect(caller).hasPermission(
          operator.address,
          /*account=*/ caller.address,
          /*domain=*/ 2, // Test different domain.
          permissionIndex,
        ),
      ).to.be.false;
    }
  });
});
