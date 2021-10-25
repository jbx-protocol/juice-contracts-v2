import hasPermission from './has_permission';
import hasPermissions from './has_permissions';
import setOperator from './set_operator';
import setOperators from './set_operators';

const contractName = 'OperatorStore';

export default function () {
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
}
