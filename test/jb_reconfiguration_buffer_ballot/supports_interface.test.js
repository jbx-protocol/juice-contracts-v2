import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import interfaceSignatures from '../helpers/interface_signatures.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';

describe('JBReconfigurationBufferBallot::supportsInterface(...)', function () {
  const DURATION = 3000;

  async function setup() {
    let [deployer, caller, ...addrs] = await ethers.getSigners();

    let mockJbFundingCycleStore = await deployMockContract(deployer, jbFundingCycleStore.abi);

    let jbBallotFactory = await ethers.getContractFactory('JBReconfigurationBufferBallot');
    let jbBallot = await jbBallotFactory.deploy(DURATION, mockJbFundingCycleStore.address);

    return {
      deployer,
      caller,
      addrs,
      jbBallot,
      mockJbFundingCycleStore
    };
  }

  it('Does not return true by default', async function () {
    const { jbBallot } = await setup();
    expect(
      await jbBallot.supportsInterface('0xffffffff')
    ).to.equal(false);
  });

  it('Supports IERC165', async function () {
    const { jbBallot } = await setup();
    expect(
      await jbBallot.supportsInterface(interfaceSignatures.IERC165)
    ).to.equal(true);
  });

  it('Supports IJBFundingCycleBallot', async function () {
    const { jbBallot } = await setup();
    expect(
      await jbBallot.supportsInterface(interfaceSignatures.IJBFundingCycleBallot)
    ).to.equal(true);
  });

  it('Supports IJBReconfigurationBufferBallot', async function () {
    const { jbBallot } = await setup();
    expect(
      await jbBallot.supportsInterface(interfaceSignatures.IJBReconfigurationBufferBallot)
    ).to.equal(true);
  });
});
