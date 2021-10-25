import { deployMockLocalContract } from '../../../utils';

import balanceOf from './balance_of';
import issue from './issue';
import lock from './lock';
import print from './print';
import redeem from './redeem';
import stake from './stake';
import totalSupplyOf from './total_supply_of';
import transfer from './transfer';
import unlock from './unlock';
import unstake from './unstake';

const contractName = 'TicketBooth';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.projects = await deployMockLocalContract('Projects');
    this.operatorStore = await deployMockLocalContract('OperatorStore');
    this.terminalDirectory = await deployMockLocalContract('TerminalDirectory');

    // Deploy the contract.
    this.contract = await this.deployContractFn(contractName, [
      this.projects.address,
      this.operatorStore.address,
      this.terminalDirectory.address,
    ]);
  });

  // Test each function.
  describe('issue(...)', issue);
  describe('print(...)', print);
  describe('unstake(...)', unstake);
  describe('stake(...)', stake);
  describe('transfer(...)', transfer);
  describe('redeem(...)', redeem);
  describe('lock(...)', lock);
  describe('unlock(...)', unlock);
  describe('balanceOf(...)', balanceOf);
  describe('totalSupplyOf(...)', totalSupplyOf);
}
