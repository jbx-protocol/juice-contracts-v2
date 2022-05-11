import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken721 URI configuration', function () {
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, nonDeployer] = await ethers.getSigners();

    const jbToken721Factory = await ethers.getContractFactory('JBToken721');
    const jbToken721 = await jbToken721Factory.deploy(NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, NFT_URI);

    return { deployer, nonDeployer, jbToken721 };
  }

  it('Owner can set URIs', async function () {
    const { deployer, jbToken721 } = await setup();

    await expect(jbToken721.connect(deployer).setContractUri('ipfs://some_hash')).to.be.not.reverted;
    await expect(jbToken721.connect(deployer).setTokenUri('ipfs://some_hash')).to.be.not.reverted;
    await expect(jbToken721.connect(deployer).setTokenUriResolver(ethers.Wallet.createRandom().address)).to.be.not.reverted;
  });

  it('Non-owner cannot set URIs', async function () {
    const { nonDeployer, jbToken721 } = await setup();

    await expect(jbToken721.connect(nonDeployer).setContractUri('ipfs://some_hash')).to.be.reverted;
    await expect(jbToken721.connect(nonDeployer).setTokenUri('ipfs://some_hash')).to.be.reverted;
    await expect(jbToken721.connect(nonDeployer).setTokenUriResolver(ethers.Wallet.createRandom().address)).to.be.reverted;
  });
});
