import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBOperatorStore::hasPermission(...)', function () {
  let jbOperatorStoreFactory;
  let jbOperatorStore;

  beforeEach(async function () {
    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();
  })

  it('hello world', function () {
    expect(true).to.be.true;
  })
});