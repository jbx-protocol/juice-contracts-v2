import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbToken721SampleUriResolver from '../../artifacts/contracts/system_tests/helpers/JBToken721SampleUriResolver.sol/JBToken721SampleUriResolver.json';

describe('JBToken721::mint(...)', function () {
  const PROJECT_ID = 10;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();

    const jbToken721Factory = await ethers.getContractFactory('JBToken721');
    const jbToken721 = await jbToken721Factory.deploy(NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, NFT_URI);

    return { deployer, addrs, jbToken721 };
  }

  it('Should mint token and emit event if caller is owner', async function () {
    const { deployer, addrs, jbToken721 } = await setup();
    const addr = addrs[1];
    const numTokens = 1;
    const tokenId = 0;

    const mintTx = await jbToken721.connect(deployer).mint(PROJECT_ID, addr.address);
    await expect(mintTx).to.emit(jbToken721, 'Transfer')
      .withArgs(ethers.constants.AddressZero, addr.address, tokenId);

    const balance = await jbToken721.ownerBalance(addr.address);
    expect(balance).to.equal(numTokens);

    const supply = await jbToken721.totalSupply(PROJECT_ID);
    expect(supply).to.equal(numTokens);

    const tokenUri = await jbToken721.tokenURI(tokenId);
    expect(tokenUri).to.equal(NFT_URI + tokenId);

    await jbToken721.connect(addr).transfer(PROJECT_ID, addrs[2].address, tokenId);
    const newBalance = await jbToken721.ownerBalance(addrs[2].address);
    expect(newBalance).to.equal(numTokens);
  });

  it(`Can't mint tokens if caller isn't owner`, async function () {
    const { addrs, jbToken721 } = await setup();
    const nonOwner = addrs[1];

    await expect(jbToken721.connect(nonOwner).mint(PROJECT_ID, nonOwner.address))
      .to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't mint tokens to zero address`, async function () {
    const { jbToken721 } = await setup();

    await expect(jbToken721.mint(PROJECT_ID, ethers.constants.AddressZero))
      .to.be.revertedWith('INVALID_RECIPIENT');
  });

  it(`Test views`, async function () {
    const { deployer, jbToken721 } = await setup();

    const contractUri = await jbToken721.contractURI();
    expect(contractUri).to.equal(NFT_URI);

    await expect(jbToken721.tokenURI(0)).to.be.revertedWith('INVALID_ADDRESS()');

    await expect(jbToken721.ownerBalance(ethers.constants.AddressZero)).to.be.revertedWith('INVALID_ADDRESS()');

    const mockJbToken721SampleUriResolver = await deployMockContract(deployer, jbToken721SampleUriResolver.abi);
    await mockJbToken721SampleUriResolver.mock.tokenURI.returns('ipfs://some_hash');
    await expect(jbToken721.connect(deployer).setTokenUriResolver(mockJbToken721SampleUriResolver.address)).to.be.not.reverted;
    await jbToken721.connect(deployer).mint(PROJECT_ID, ethers.Wallet.createRandom().address);
    const newTokenUri = await jbToken721.tokenURI(0);
    expect(newTokenUri).to.equal('ipfs://some_hash');
  });
});
