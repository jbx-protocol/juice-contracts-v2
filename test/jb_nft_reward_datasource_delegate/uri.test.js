import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbToken721SampleUriResolver from '../../artifacts/contracts/system_tests/helpers/JBToken721SampleUriResolver.sol/JBToken721SampleUriResolver.json';

describe('JBNFTRewardDataSourceDelegate::tokenUri(...),contractUri(...)', function () {
  const PROJECT_ID = 2;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://content_base/';
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

    const mockJbToken721SampleUriResolver = await deployMockContract(deployer, jbToken721SampleUriResolver.abi);
    await jbNFTRewardDataSourceFactory
      .connect(deployer)
      .deploy(
        PROJECT_ID,
        mockJbDirectory.address,
        2,
        { token: ethToken, value: 1000000, decimals: 18, currency: CURRENCY_ETH },
        NFT_NAME,
        NFT_SYMBOL,
        NFT_URI,
        mockJbToken721SampleUriResolver.address,
        NFT_METADATA,
        accounts[0].address,
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

    return {
      deployer,
      projectTerminal,
      owner,
      differentOwner,
      notOwner,
      accounts,
      jbNFTRewardDataSource,
    };
  }

  it('Token URI Test', async function () {
    const { jbNFTRewardDataSource } = await setup();
    const tokenId = 0;
    const invalidTokenId = 100000;

    expect(await jbNFTRewardDataSource['tokenURI(uint256)'](tokenId)).to.equal('ipfs://content_base/0');
    await expect(jbNFTRewardDataSource['tokenURI(uint256)'](invalidTokenId)).to.be.revertedWith('INVALID_TOKEN');
  });

  it('Contract URI Test', async function () {
    const { jbNFTRewardDataSource } = await setup();

    expect(await jbNFTRewardDataSource['contractURI()']()).to.equal('ipfs://metadata');
  });

  it('Set Token URI Test', async function () {
    const { deployer, jbNFTRewardDataSource } = await setup();
    const tokenId = 0;

    await jbNFTRewardDataSource.connect(deployer).setTokenUri('ipfs://different_base/');
    expect(await jbNFTRewardDataSource['tokenURI(uint256)'](tokenId)).to.equal('ipfs://different_base/0');
  });

  it('Set Token URI Resolver Test', async function () {
    const { deployer, jbNFTRewardDataSource } = await setup();
    const tokenId = 0;

    const mockJbToken721SampleUriResolver = await deployMockContract(deployer, jbToken721SampleUriResolver.abi);
    await mockJbToken721SampleUriResolver.mock.tokenURI.returns('ipfs://different_hash');

    await jbNFTRewardDataSource.connect(deployer).connect(deployer).setTokenUriResolver(mockJbToken721SampleUriResolver.address);
    expect(await jbNFTRewardDataSource['tokenURI(uint256)'](tokenId)).to.equal('ipfs://different_hash');
  });


  it('Set Contract URI Test', async function () {
    const { deployer, jbNFTRewardDataSource } = await setup();

    await jbNFTRewardDataSource.connect(deployer).setContractUri('ipfs://different_metadata')
    expect(await jbNFTRewardDataSource['contractURI()']()).to.equal('ipfs://different_metadata');
  });
});
