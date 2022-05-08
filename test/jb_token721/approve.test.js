import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken721::approve(...)', function () {
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

  it('Should approve and emit event if caller is owner', async function () {
    const { tokenHolder, nonHolder, jbToken721 } = await setup();
    const tokenId = 0;

    const approveTx = await jbToken721.connect(tokenHolder)['approve(uint256,address,uint256)'](PROJECT_ID, nonHolder.address, tokenId);
    await expect(approveTx).to.emit(jbToken721, 'Approval').withArgs(tokenHolder.address, nonHolder.address, tokenId);
  });
});
