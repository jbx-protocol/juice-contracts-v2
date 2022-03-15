import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBProjectPayer::setDefaultValues(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = ethers.utils.randomBytes(32);
  const PROJECT_ID = 1;
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MEMO = 'hi world';
  const METADATA = ethers.utils.randomBytes(32);

  async function setup() {
    let [deployer, owner, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbFakeProjectFactory = await ethers.getContractFactory('JBFakeProjectPayer');
    let jbFakeProjectPayer = await jbFakeProjectFactory.deploy(
      INITIAL_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      mockJbDirectory.address,
      owner.address
    );

    return {
      deployer,
      owner,
      addrs,
      mockJbDirectory,
      jbFakeProjectPayer,
    };
  }

  it(`Should set defaults if owner`, async function () {
    const { owner, jbFakeProjectPayer } = await setup();

    expect(await jbFakeProjectPayer.defaultProjectId()).to.equal(
      INITIAL_PROJECT_ID,
    );
    expect(await jbFakeProjectPayer.defaultBeneficiary()).to.equal(
      INITIAL_BENEFICIARY,
    );
    expect(await jbFakeProjectPayer.defaultPreferClaimedTokens()).to.equal(
      INITIAL_PREFER_CLAIMED_TOKENS,
    );
    expect(await jbFakeProjectPayer.defaultMemo()).to.equal(
      INITIAL_MEMO,
    );
    expect(await jbFakeProjectPayer.defaultMetadata()).to.equal(
      ethers.BigNumber.from(INITIAL_METADATA),
    );

    const setDefaultsTx = await jbFakeProjectPayer
      .connect(owner)
      .setDefaultValues(PROJECT_ID, BENEFICIARY, PREFER_CLAIMED_TOKENS, MEMO, METADATA);

    expect(await jbFakeProjectPayer.defaultProjectId()).to.equal(
      PROJECT_ID,
    );
    expect(await jbFakeProjectPayer.defaultBeneficiary()).to.equal(
      BENEFICIARY,
    );
    expect(await jbFakeProjectPayer.defaultPreferClaimedTokens()).to.equal(
      PREFER_CLAIMED_TOKENS,
    );
    expect(await jbFakeProjectPayer.defaultMemo()).to.equal(
      MEMO,
    );
    expect(await jbFakeProjectPayer.defaultMetadata()).to.equal(
      ethers.BigNumber.from(METADATA),
    );

    await expect(setDefaultsTx)
      .to.emit(jbFakeProjectPayer, 'SetDefaultValues')
      .withArgs(PROJECT_ID, BENEFICIARY, PREFER_CLAIMED_TOKENS, MEMO, ethers.BigNumber.from(METADATA), owner.address);
  });

  it(`Can't set defaults if not owner`, async function () {
    const { addrs, jbFakeProjectPayer } = await setup();

    await expect(
      jbFakeProjectPayer.connect(addrs[0]).setDefaultValues(PROJECT_ID, BENEFICIARY, PREFER_CLAIMED_TOKENS, MEMO, METADATA),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
