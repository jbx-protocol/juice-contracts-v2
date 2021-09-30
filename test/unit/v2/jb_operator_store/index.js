const hasPermission = require('./has_permission');
const hasPermissions = require('./has_permissions');
const setOperator = require('./set_operator');
const setOperators = require('./set_operators');

module.exports = function () {
  // Before the tests, deploy the contract.
  before(async function () {
    this.contract = await this.deployContractFn('JBOperatorStore');
  });

  describe('setOperator(...)', setOperator);
  describe('setOperators(...)', setOperators);
  describe('hasPermission(...)', hasPermission);
  describe('hasPermissions(...)', hasPermissions);
};
