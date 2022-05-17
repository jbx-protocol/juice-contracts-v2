import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';

describe('JBNFTRewardDataSourceDelegate::transfer(...)', function () {
  const PROJECT_ID = 2;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://content_base';
  const NFT_METADATA = 'ipfs://metadata';
  const CURRENCY_ETH = 1;
  const ETH_TO_PAY = ethers.utils.parseEther('1');
  const ethToken = ethers.constants.AddressZero;

  async function setup() {
    let [deployer, projectTerminal, owner, differentOwner, notOwner, ...accounts] = await ethers.getSigners();

    let [
      mockJbDirectory,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
    ]);

    await mockJbDirectory.mock.isTerminalOf.withArgs(PROJECT_ID, projectTerminal.address).returns(true);

    const jbNFTRewardDataSourceFactory = await ethers.getContractFactory('JBNFTRewardDataSourceDelegate', deployer);
    const jbNFTRewardDataSource = await jbNFTRewardDataSourceFactory
      .connect(deployer)
      .deploy(
        PROJECT_ID,
        mockJbDirectory.address,
        2,
        { token: ethToken, value: 1000000, decimals: 18, currency: CURRENCY_ETH },
        NFT_NAME,
        NFT_SYMBOL,
        NFT_URI,
        ethers.constants.AddressZero,
        NFT_METADATA,
        ethers.constants.AddressZero,
      );

    await jbNFTRewardDataSource.connect(projectTerminal).didPay({
      payer: owner.address,
      projectId: PROJECT_ID,
      currentFundingCycleConfiguration: 0,
      amount: { token: ethToken, value: ETH_TO_PAY, decimals: 18, currency: CURRENCY_ETH },
      projectTokenCount: 0,
      beneficiary: owner.address,
      preferClaimedTokens: true,
      memo: '',
      metadata: '0x42'
    });

    await jbNFTRewardDataSource.connect(projectTerminal).didPay({
      payer: differentOwner.address,
      projectId: PROJECT_ID,
      currentFundingCycleConfiguration: 0,
      amount: { token: ethToken, value: ETH_TO_PAY, decimals: 18, currency: CURRENCY_ETH },
      projectTokenCount: 0,
      beneficiary: differentOwner.address,
      preferClaimedTokens: true,
      memo: '',
      metadata: '0x42'
    });

    return {
      projectTerminal,
      owner,
      differentOwner,
      notOwner,
      accounts,
      jbNFTRewardDataSource,
    };
  }

  it('Should transfer token and emit event if caller is owner', async function () {
    const { jbNFTRewardDataSource, owner, notOwner } = await setup();
    const tokenId = 0;

    const transferTx = await jbNFTRewardDataSource
      .connect(owner)
    ['transfer(uint256,address,uint256)'](PROJECT_ID, notOwner.address, tokenId);

    await expect(transferTx)
      .to.emit(jbNFTRewardDataSource, 'Transfer')
      .withArgs(owner.address, notOwner.address, tokenId);

    const balance = await jbNFTRewardDataSource['ownerBalance(address)'](owner.address);
    expect(balance).to.equal(0);

    expect(await jbNFTRewardDataSource['ownerBalance(address)'](notOwner.address)).to.equal(1);
    expect(await jbNFTRewardDataSource['isOwner(address,uint256)'](notOwner.address, tokenId)).to.equal(true);

    await expect(await jbNFTRewardDataSource.connect(notOwner)['transferFrom(uint256,address,address,uint256)'](PROJECT_ID, notOwner.address, owner.address, tokenId))
      .to.emit(jbNFTRewardDataSource, 'Transfer')
      .withArgs(notOwner.address, owner.address, tokenId);

    expect(await jbNFTRewardDataSource['totalSupply(uint256)'](PROJECT_ID)).to.equal(2);
  });

  it(`Can't transfer to zero address`, async function () {
    const { jbNFTRewardDataSource, owner } = await setup();
    const tokenId = 0;

    await expect(
      jbNFTRewardDataSource
        .connect(owner)
      ['transfer(uint256,address,uint256)'](PROJECT_ID, ethers.constants.AddressZero, tokenId),
    ).to.be.revertedWith('INVALID_RECIPIENT');

    await expect(jbNFTRewardDataSource.ownerBalance(ethers.constants.AddressZero)).to.be.revertedWith('INVALID_ADDRESS');
  });

  it(`Can't transfer tokens that aren't owned`, async function () {
    const { jbNFTRewardDataSource, owner, notOwner } = await setup();
    const tokenId = 1;

    await expect(
      jbNFTRewardDataSource
        .connect(owner)
      ['transfer(uint256,address,uint256)'](PROJECT_ID, notOwner.address, tokenId),
    ).to.be.revertedWith('WRONG_FROM');
  });
});
