const challengeHandle = require('./challenge_handle');
const claimHandle = require('./claim_handle');
const create = require('./create');
const renewHandle = require('./renew_handle');
const setHandle = require('./set_handle');
const setUri = require('./set_uri');
const transferHandle = require('./transfer_handle');

const contractName = 'Projects';

module.exports = function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.operatorStore = await this.deployMockLocalContractFn('OperatorStore');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [this.operatorStore.address]);
  });

  // Test each function.
  describe('create(...)', create);
  describe('setHandle(...)', setHandle);
  describe('setUri(...)', setUri);
  describe('transferHandle(...)', transferHandle);
  describe('claimHandle(...)', claimHandle);
  describe('renewHandle(...)', renewHandle);
  describe('challengeHandle(...)', challengeHandle);
};
