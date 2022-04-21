import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';

describe('JBReconfigurationBufferBallot::supportsInterface(...)', function () {
  const DURATION = 3000;
  const PROJECT_ID = 69;

  async function setup() {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [deployer, caller, ...addrs] = await ethers.getSigners();

    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);

    let jbBallotFactory = await ethers.getContractFactory('JBReconfigurationBufferBallot');
    let jbBallot = await jbBallotFactory.deploy(DURATION, mockJbFundingCycleStore.address);

    return {
      deployer,
      caller,
      addrs,
      jbBallot,
      mockJbFundingCycleStore,
      timestamp,
    };
  }

  it('Supports IERC165', async function () {
    const { jbBallot } = await setup();

    const interfaceId = '0x01ffc9a7';
    expect(await jbBallot.supportsInterface(interfaceId)).to.equal(true);
  });

  it('Supports IJBReconfigurationBufferBallot', async function () {
    const { jbBallot } = await setup();

    const interfaceId = '0x4aeb8d25';
    expect(await jbBallot.supportsInterface(interfaceId)).to.equal(true);
  });

  it('Supports IJBFundingCycleBallot', async function () {
    const { jbBallot } = await setup();

    const interfaceId = '0x7ba3dfb3';
    expect(await jbBallot.supportsInterface(interfaceId)).to.equal(true);
  });

  it('Does not return true by default', async function () {
    const { jbBallot } = await setup();

    const interfaceId = '0xffffffff';
    expect(await jbBallot.supportsInterface(interfaceId)).to.equal(false);
  });
});
