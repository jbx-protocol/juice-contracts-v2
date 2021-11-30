import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('JBToken::mint(...)', function () {
  const PROJECT_ID = 10;
  const name = 'TestTokenDAO';
  const symbol = 'TEST';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const testToken = await deployJbToken(name, symbol);
    return { deployer, addrs, testToken };
  }

  it('Should mint token and emit event if caller is owner', async function () {
    const { deployer, addrs, testToken } = await setup();
    const addr = addrs[1];
    const numTokens = 3000;
    const mintTx = await testToken.connect(deployer).mint(PROJECT_ID, addr.address, numTokens);

    await expect(mintTx)
      .to.emit(testToken, 'Transfer')
      .withArgs(ethers.constants.AddressZero, addr.address, numTokens);

    // overloaded functions need to be called using the full function signature
    const balance = await testToken['balanceOf(uint256,address)'](PROJECT_ID, addr.address);
    expect(balance).to.equal(numTokens);

    const supply = await testToken['totalSupply(uint256)'](PROJECT_ID);
    expect(supply).to.equal(numTokens);
  });

  it(`Can't mint tokens if caller isn't owner`, async function () {
    const { addrs, testToken } = await setup();
    const nonOwner = addrs[1];
    await expect(
      testToken.connect(nonOwner).mint(PROJECT_ID, nonOwner.address, 3000),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't mint tokens to zero address`, async function () {
    const { testToken } = await setup();
    await expect(testToken.mint(PROJECT_ID, ethers.constants.AddressZero, 3000)).to.be.revertedWith(
      'ERC20: mint to the zero address',
    );
  });

  it(`Can't mint tokens if the new total exceeds max supply`, async function () {
    const { addrs, testToken } = await setup();
    const addr = addrs[1];
    const numTokens = BigInt(2 ** 224); // bigger than max supply of (2^224)-1
    await expect(testToken.mint(PROJECT_ID, addr.address, numTokens)).to.be.revertedWith(
      'ERC20Votes: total supply risks overflowing votes',
    );
  });
});
