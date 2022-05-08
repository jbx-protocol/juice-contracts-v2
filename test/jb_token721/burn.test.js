import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken721::burn(...)', function () {
  const PROJECT_ID = 10;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, tokenHolder] = await ethers.getSigners();

    const jbToken721Factory = await ethers.getContractFactory('JBToken721');
    const jbToken721 = await jbToken721Factory.deploy(NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, NFT_URI);
    await jbToken721.connect(deployer).mint(PROJECT_ID, tokenHolder.address);

    return { deployer, tokenHolder, jbToken721 };
  }

  it('Should burn token and emit event if caller is owner', async function () {
    const { deployer, tokenHolder, jbToken721 } = await setup();
    const tokenId = 0;
    const burnTx = await jbToken721.connect(deployer).burn(PROJECT_ID, tokenHolder.address, tokenId);

    await expect(burnTx).to.emit(jbToken721, 'Transfer')
      .withArgs(tokenHolder.address, ethers.constants.AddressZero, tokenId);

    const balance = await jbToken721.ownerBalance(tokenHolder.address);
    expect(balance).to.equal(0);
  });

  it(`Can't burn tokens if caller isn't owner`, async function () {
    const { tokenHolder, jbToken721 } = await setup();
    const tokenId = 2;

    await expect(jbToken721.connect(tokenHolder).burn(PROJECT_ID, tokenHolder.address, tokenId))
      .to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't burn tokens if burn holder doesn't own`, async function () {
    const { deployer, tokenHolder, jbToken721 } = await setup();
    const tokenId = 2;

    await expect(jbToken721.connect(deployer).burn(PROJECT_ID, tokenHolder.address, tokenId))
      .to.be.revertedWith('INCORRECT_OWNER');
  });
});
