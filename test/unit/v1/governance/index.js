import { deployContract, deployMockLocalContract } from '../../../utils';

import addPriceFeed from './add_price_feed';
import allowMigration from './allow_migration';
import appointGovernance from './appoint_governance';
import setFee from './set_fee';

const contractName = 'Governance';

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
  describe('allowMigration(...)', allowMigration);
  describe('addPriceFeed(...)', addPriceFeed);
  describe('setFee(...)', setFee);
  describe('appointGovernance(...)', appointGovernance);
}
