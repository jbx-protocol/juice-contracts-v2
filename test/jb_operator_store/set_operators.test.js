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

  function makeOperator(operator, domain, permissionIndexes) {
    return {
      address: operator.address,
      domain: domain,
      permissionIndexes: permissionIndexes,
      packedPermissionIndexes: makePackedPermissions(permissionIndexes),
    };
  }

  async function setOperators(operators, caller) {
    const tx = await jbOperatorStore
      .connect(caller)
      .setOperators(
        operators.map((operator) => [
          operator.address,
          operator.domain,
          operator.permissionIndexes,
        ]),
      );
    return tx;
  }

  async function validateEvents(tx, operators, caller) {
    await Promise.all(
      operators.map(async (operator, _) => {
        await expect(tx)
          .to.emit(jbOperatorStore, 'SetOperator')
          .withArgs(
            operator.address,
            /*account=*/ caller.address,
            operator.domain,
            operator.permissionIndexes,
            operator.packedPermissionIndexes,
          );

        expect(
          await jbOperatorStore.permissionsOf(
            operator.address,
            /*account=*/ caller.address,
            operator.domain,
          ),
        ).to.equal(operator.packedPermissionIndexes);
      }),
    );
  }

  async function setOperatorsAndValidateEvents(operators, caller) {
    let tx = await setOperators(operators, caller);
    validateEvents(tx, operators, caller);
  }

  it(`Set with no previous values, then override and clear them`, async function () {
    let caller = signers[0];
    let domain = 1;

    // Set operators with the same permission indexes for the domain.
    let permissionIndexes = [1, 2, 3];
    let operators = [
      makeOperator(/*operator=*/ signers[1], domain, permissionIndexes),
      makeOperator(/*operator=*/ signers[2], domain, permissionIndexes),
      makeOperator(/*operator=*/ signers[3], domain, permissionIndexes),
    ];
    await setOperatorsAndValidateEvents(operators, caller);

    // Override the previously set values.
    permissionIndexes = [4, 5, 6];
    operators = [
      makeOperator(/*operator=*/ signers[1], domain, permissionIndexes),
      makeOperator(/*operator=*/ signers[2], domain, permissionIndexes),
      makeOperator(/*operator=*/ signers[3], domain, permissionIndexes),
    ];
    await setOperatorsAndValidateEvents(operators, caller);

    // Clear previously set values.
    permissionIndexes = [];
    operators = [
      makeOperator(/*operator=*/ signers[1], domain, permissionIndexes),
      makeOperator(/*operator=*/ signers[2], domain, permissionIndexes),
      makeOperator(/*operator=*/ signers[3], domain, permissionIndexes),
    ];
    await setOperatorsAndValidateEvents(operators, caller);
  });

  it(`Same operator used for two different projects`, async function () {
    let caller = signers[0];
    let domain1 = 1;
    let domain2 = 2;

    // Set operators with the same permission indexes for the domain.
    let permissionIndexes = [1, 2, 3];
    let operators = [
      makeOperator(/*operator=*/ signers[1], domain1, permissionIndexes),
      makeOperator(/*operator=*/ signers[1], domain2, permissionIndexes),
    ];
    await setOperatorsAndValidateEvents(operators, caller);
  });

  it(`Same operator used for the same project`, async function () {
    let caller = signers[0];
    let domain = 1;

    // Set operators with the same permission indexes for the domain.
    let permissionIndexes1 = [1, 2, 3];
    let permissionIndexes2 = [3, 4, 5];
    let operators = [
      makeOperator(/*operator=*/ signers[1], domain, permissionIndexes1),
      makeOperator(/*operator=*/ signers[1], domain, permissionIndexes2),
    ];
    let tx = await setOperators(operators, caller);

    // The permission indexes from the first set should be overridden.
    await validateEvents(tx, operators.slice(1), caller);
  });
});
