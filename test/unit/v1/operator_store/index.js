const hasPermission = require('./has_permission');
const hasPermissions = require('./has_permissions');
const setOperator = require('./set_operator');
const setOperators = require('./set_operators');

const contractName = 'OperatorStore';

module.exports = function () {
  // Before the tests, deploy the contract.
  before(async function () {
    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName);
  });

  // Test each function.
  describe('setOperator(...)', setOperator);
  describe('setOperators(...)', setOperators);
  describe('hasPermission(...)', hasPermission);
  describe('hasPermissions(...)', hasPermissions);
};
