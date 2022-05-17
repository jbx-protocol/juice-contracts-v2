import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbToken721SampleUriResolver from '../../artifacts/contracts/system_tests/helpers/JBToken721SampleUriResolver.sol/JBToken721SampleUriResolver.json';


describe('JBNFTRewardDataSourceDelegate::tokenUri(...)', function () {
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
    const mockJbToken721SampleUriResolver = await deployMockContract(deployer, jbToken721SampleUriResolver.abi);
    await mockJbToken721SampleUriResolver.mock.tokenURI.returns('ipfs://some_hash');

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
        mockJbToken721SampleUriResolver.address,
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

    return {
      projectTerminal,
      owner,
      differentOwner,
      notOwner,
      accounts,
      jbNFTRewardDataSource,
    };
  }

  it('Token URI Resolver Test', async function () {
    const { jbNFTRewardDataSource } = await setup();
    const tokenId = 0;

    expect(await jbNFTRewardDataSource['tokenURI(uint256)'](tokenId)).to.equal('ipfs://some_hash');
  });
});
