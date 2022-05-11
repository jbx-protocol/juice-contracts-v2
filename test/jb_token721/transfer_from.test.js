import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken721::transferFrom(...)', function () {
  const PROJECT_ID = 10;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, tokenHolder, nonHolder] = await ethers.getSigners();

    const jbToken721Factory = await ethers.getContractFactory('JBToken721');
    const jbToken721 = await jbToken721Factory.deploy(NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, NFT_URI);
    await jbToken721.connect(deployer).mint(PROJECT_ID, tokenHolder.address);

    return { deployer, tokenHolder, nonHolder, jbToken721 };
  }

  it('Should transfer token and emit event if caller is owner', async function () {
    const { deployer, tokenHolder, nonHolder, jbToken721 } = await setup();
    const tokenId = 0;

    await jbToken721.connect(tokenHolder)['approve(address,uint256)'](deployer.address, tokenId);
    const transferTx = await jbToken721.connect(deployer)['transferFrom(uint256,address,address,uint256)']
      (PROJECT_ID, tokenHolder.address, nonHolder.address, tokenId);

    await expect(transferTx).to.emit(jbToken721, 'Transfer').withArgs(tokenHolder.address, nonHolder.address, tokenId);

    let balance = await jbToken721['balanceOf(address)'](tokenHolder.address);
    expect(balance).to.equal(0);

    balance = await jbToken721['balanceOf(address)'](nonHolder.address);
    expect(balance).to.equal(1);
  });

  it(`Can't transfer tokens if caller doesn't have approval`, async function () {
    const { tokenHolder, nonHolder, jbToken721 } = await setup();
    const tokenId = 0;

    await expect(jbToken721.connect(nonHolder)['transferFrom(uint256,address,address,uint256)']
      (PROJECT_ID, tokenHolder.address, nonHolder.address, tokenId))
      .to.be.revertedWith('NOT_AUTHORIZED');
  });

  it(`Can't transfer to zero address`, async function () {
    const { deployer, tokenHolder, jbToken721 } = await setup();
    const tokenId = 0;

    await jbToken721.connect(tokenHolder)['approve(address,uint256)'](deployer.address, tokenId);
    await expect(jbToken721.connect(deployer)['transferFrom(uint256,address,address,uint256)']
      (PROJECT_ID, tokenHolder.address, ethers.constants.AddressZero, tokenId))
      .to.be.revertedWith('INVALID_RECIPIENT');
  });
});
