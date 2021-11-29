import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken::transferOwnership(...)', function () {
  const PROJECT_ID = 10;
  const name = 'TestTokenDAO';
  const symbol = 'TEST';
  const startingBalance = 3000;

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const testToken = await deployToken(name, symbol);
    await testToken.connect(deployer).mint(PROJECT_ID, addrs[1].address, startingBalance);
    return { deployer, addrs, testToken };
  }

  async function deployToken(name, symbol) {
    const jbTokenFactory = await ethers.getContractFactory('JBToken');
    const jbToken = await jbTokenFactory.deploy(name, symbol);
    await jbToken.deployed();
    return jbToken;
  }

  // Tests

  it('Should transfer ownership to another address if caller is owner', async function () {
    const { deployer, addrs, testToken } = await setup();
    const newAddr = addrs[0];
    const transferOwnershipTx = await testToken
      .connect(deployer)
      .transferOwnership(newAddr.address);

    await expect(transferOwnershipTx).to.emit(testToken, 'OwnershipTransferred');

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
    const zeroAddr = ethers.constants.AddressZero;
    await expect(testToken.transferOwnership(zeroAddr)).to.be.revertedWith(
      'Ownable: new owner is the zero address',
    );
  });
});
