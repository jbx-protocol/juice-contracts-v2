import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('JBToken::transferOwnership(...)', function () {
  const name = 'TestTokenDAO';
  const symbol = 'TEST';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const testToken = await deployJbToken(name, symbol);
    return { deployer, addrs, testToken };
  }

  it('Should transfer ownership to another address if caller is owner', async function () {
    const { deployer, addrs, testToken } = await setup();
    const newAddr = addrs[0];

    const transferOwnershipTx = await testToken
      .connect(deployer)
      .transferOwnership(newAddr.address);

    await expect(transferOwnershipTx)
      .to.emit(testToken, 'OwnershipTransferred')
      .withArgs(deployer.address, newAddr.address);

    const balance = await testToken.owner();
    expect(balance).to.equal(newAddr.address);
  });

  it(`Can't transfer ownership if caller isn't owner`, async function () {
    const { addrs, testToken } = await setup();
    const newAddr = addrs[0];
    const nonOwner = addrs[1];
    await expect(testToken.connect(nonOwner).transferOwnership(newAddr.address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it(`Can't set new owner to zero address`, async function () {
    const { testToken } = await setup();
    await expect(testToken.transferOwnership(ethers.constants.AddressZero)).to.be.revertedWith(
      'Ownable: new owner is the zero address',
    );
  });
});
