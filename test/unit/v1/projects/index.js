import { deployMockLocalContract } from '../../../utils';

import challengeHandle from './challenge_handle';
import claimHandle from './claim_handle';
import create from './create';
import renewHandle from './renew_handle';
import setHandle from './set_handle';
import setUri from './set_uri';
import transferHandle from './transfer_handle';

const contractName = 'Projects';

export default function () {
  // Before the tests, deploy mocked dependencies and the contract.
  before(async function () {
    // Deploy mock dependency contracts.
    this.operatorStore = await deployMockLocalContract('OperatorStore');

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
}
