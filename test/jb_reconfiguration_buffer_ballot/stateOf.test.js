import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';

describe('JBReconfigurationBufferBallot.stateOf(...)', function () {
  const DURATION = 3000;
  const PROJECT_ID = 69;

  async function setup() {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [deployer, caller, ...addrs] = await ethers.getSigners();

    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);

    let jbBallotFactory = await ethers.getContractFactory('JBReconfigurationBufferBallot');
    let jbBallot = await jbBallotFactory.deploy(DURATION);

    return {
      deployer,
      caller,
      addrs,
      jbBallot,
      mockJbFundingCycleStore,
      timestamp,
    };
  }

  it.skip('Should return Active if the delay has not yet passed and the funding cycle has not started yet', async function () {
    const { jbBallot, timestamp } = await setup();

    expect(
      await jbBallot.stateOf(
        PROJECT_ID,
        timestamp + 10, // configured
        timestamp + 10,
      ), // start (+10 as every Hardhat transaction move timestamp)
    ).to.equals(0);
  });

  it.skip('Should return Failed if the delay has not yet passed and the funding cycle has already started', async function () {
    const { jbBallot, timestamp } = await setup();

    expect(await jbBallot.stateOf(PROJECT_ID, timestamp + 10, timestamp - 1)).to.equals(2);
  });

  it('Should return Approved if the delay has passed', async function () {
    const { jbBallot, timestamp } = await setup();

    expect(await jbBallot.stateOf(PROJECT_ID, timestamp - DURATION - 10, timestamp + 10)).to.equals(
      1,
    );
  });
});
