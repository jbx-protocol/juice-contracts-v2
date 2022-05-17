import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBNFTRewardDataSourceDelegate::mint(...), burn()', function () {
  const PROJECT_ID = 2;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://content_base';
  const NFT_METADATA = 'ipfs://metadata';
  const CURRENCY_ETH = 1;
  const ethToken = ethers.constants.AddressZero;
  const MAX_SUPPLY = 2;

  async function setup() {
    let [deployer, owner, anotherOwner, nonOwner, ...accounts] = await ethers.getSigners();

    let [
      mockJbDirectory,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
    ]);

    const jbNFTRewardDataSourceFactory = await ethers.getContractFactory('JBNFTRewardDataSourceDelegate', deployer);
    const jbNFTRewardDataSource = await jbNFTRewardDataSourceFactory
      .connect(deployer)
      .deploy(
        PROJECT_ID,
        mockJbDirectory.address,
        MAX_SUPPLY,
        { token: ethToken, value: 1000000, decimals: 18, currency: CURRENCY_ETH },
        NFT_NAME,
        NFT_SYMBOL,
        NFT_URI,
        ethers.constants.AddressZero,
        NFT_METADATA,
        ethers.constants.AddressZero,
      );

    return {
      deployer,
      owner,
      anotherOwner,
      nonOwner,
      accounts,
      jbNFTRewardDataSource,
    };
  }

  it(`Should mint token if called by owner`, async function () {
    const { jbNFTRewardDataSource, deployer, owner } = await setup();

    await expect(jbNFTRewardDataSource.connect(deployer).mint(owner.address))
      .to.emit(jbNFTRewardDataSource, 'Transfer')
      .withArgs(ethers.constants.AddressZero, owner.address, 0);
  });

  it(`Should not mint token if not called by owner`, async function () {
    const { jbNFTRewardDataSource, owner } = await setup();

    await expect(jbNFTRewardDataSource.connect(owner).mint(owner.address))
      .to.be.revertedWith('');
  });

  it(`Should not mint token if supply exhausted`, async function () {
    const { jbNFTRewardDataSource, deployer, owner } = await setup();

    await jbNFTRewardDataSource.connect(deployer).mint(owner.address);
    await jbNFTRewardDataSource.connect(deployer).mint(owner.address);

    await expect(jbNFTRewardDataSource.connect(deployer).mint(owner.address))
      .to.be.revertedWith('SUPPLY_EXHAUSTED');
  });

  it(`Should burn token if called by owner with correct address/tokenid pair`, async function () {
    const { jbNFTRewardDataSource, deployer, owner } = await setup();

    await jbNFTRewardDataSource.connect(deployer).mint(owner.address);

    await expect(jbNFTRewardDataSource.connect(deployer).burn(owner.address, 0))
      .to.emit(jbNFTRewardDataSource, 'Transfer')
      .withArgs(owner.address, ethers.constants.AddressZero, 0);

  });

  it(`Should not burn token if not called by owner`, async function () {
    const { jbNFTRewardDataSource, deployer, owner } = await setup();

    await jbNFTRewardDataSource.connect(deployer).mint(owner.address);

    await expect(jbNFTRewardDataSource.connect(owner).burn(owner.address, 0))
      .to.be.revertedWith('Ownable: caller is not the owner')
  });

  it(`Should not burn token if not called with correct address/tokenid pair`, async function () {
    const { jbNFTRewardDataSource, deployer, owner, anotherOwner } = await setup();

    await jbNFTRewardDataSource.connect(deployer).mint(owner.address);
    await jbNFTRewardDataSource.connect(deployer).mint(anotherOwner.address);

    await expect(jbNFTRewardDataSource.connect(deployer).burn(owner.address, 1))
      .to.be.revertedWith('INCORRECT_OWNER()')
  });
});
