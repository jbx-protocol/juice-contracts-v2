import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken721::transferOwnership(...)', function () {
  const PROJECT_ID = 10;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, otherAddress] = await ethers.getSigners();

    const jbToken721Factory = await ethers.getContractFactory('JBToken721');
    const jbToken721 = await jbToken721Factory.deploy(NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, NFT_URI);

    return { deployer, otherAddress, jbToken721 };
  }

  it('Should transfer ownership to another address if caller is owner', async function () {
    const { deployer, otherAddress, jbToken721 } = await setup();

    const transferOwnershipTx = await jbToken721.connect(deployer)['transferOwnership(uint256,address)'](PROJECT_ID, otherAddress.address);

    await expect(transferOwnershipTx).to.emit(jbToken721, 'OwnershipTransferred').withArgs(deployer.address, otherAddress.address);
    expect(await jbToken721.owner()).to.equal(otherAddress.address);
  });

  it(`Can't transfer ownership if caller isn't owner`, async function () {
    const { otherAddress, jbToken721 } = await setup();

    await expect(jbToken721.connect(otherAddress)['transferOwnership(uint256,address)']
      (PROJECT_ID, otherAddress.address))
      .to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't set new owner to zero address`, async function () {
    const { deployer, jbToken721 } = await setup();
    await expect(jbToken721.connect(deployer)['transferOwnership(uint256,address)'](PROJECT_ID, ethers.constants.AddressZero))
      .to.be.revertedWith('Ownable: new owner is the zero address');
  });
});
