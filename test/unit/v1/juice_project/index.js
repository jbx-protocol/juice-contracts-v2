import { deployContract, deployMockLocalContract } from '../../../helpers/utils';

import pay from './pay';
import setOperator from './set_operator';
import setOperators from './set_operators';
import setProjectId from './set_project_id';
import takeFee from './take_fee';
import transferProjectOwnership from './transfer_project_ownership';
import withdraw from './withdraw';

const contractName = 'ExampleJuiceboxProject';

export default function () {
  // Before the tests, deploy the contract.
  before(async function () {
    this.projectId = 1;

    this.terminalDirectory = await deployMockLocalContract('TerminalDirectory');

    // Deploy the contract.
    this.contract = await deployContract(contractName, [
      this.projectId,
      this.terminalDirectory.address,
    ]);
  });

  // Test each function.
  describe('setOperator(...)', setOperator);
  describe('setOperators(...)', setOperators);
  describe('transferProjectOwnership(...)', transferProjectOwnership);
  describe('pay(...)', pay);
  describe('takeFee(...)', takeFee);
  describe('setProjectId(...)', setProjectId);
  describe('withdraw(...)', withdraw);
}
