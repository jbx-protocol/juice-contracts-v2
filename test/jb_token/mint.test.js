import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('JBToken::mint(...)', function () {
  const PROJECT_ID = 10;
  const name = 'TestTokenDAO';
  const symbol = 'TEST';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const jbToken = await deployJbToken(name, symbol, PROJECT_ID);
    return { deployer, addrs, jbToken };
  }

  it('Should mint token and emit event if caller is owner', async function () {
    const { deployer, addrs, jbToken } = await setup();
    const addr = addrs[1];
    const numTokens = 3000;
    const mintTx = await jbToken.connect(deployer).mint(PROJECT_ID, addr.address, numTokens);

    await expect(mintTx)
      .to.emit(jbToken, 'Transfer')
      .withArgs(ethers.constants.AddressZero, addr.address, numTokens);

    // overloaded functions need to be called using the full function signature
    const balance = await jbToken['balanceOf(address,uint256)'](addr.address, PROJECT_ID);
    expect(balance).to.equal(numTokens);

    const supply = await jbToken['totalSupply(uint256)'](PROJECT_ID);
    expect(supply).to.equal(numTokens);
  });

  it('Cannot mint for the project ID 0', async function () {
    const { deployer, addrs, jbToken } = await setup();
    const addr = addrs[1];
    const numTokens = 3000;

    await expect(jbToken.connect(deployer).mint(0, addr.address, numTokens)).to.be.revertedWith(
      'BAD_PROJECT()',
    );
  });

  it('Cannot mint from another project id than the one of the token', async function () {
    const { deployer, addrs, jbToken } = await setup();
    const addr = addrs[1];
    const numTokens = 3000;

    await expect(
      jbToken.connect(deployer).mint(PROJECT_ID + 1, addr.address, numTokens),
    ).to.be.revertedWith('BAD_PROJECT()');
  });

  it(`Can't mint tokens if caller isn't owner`, async function () {
    const { addrs, jbToken } = await setup();
    const nonOwner = addrs[1];
    await expect(
      jbToken.connect(nonOwner).mint(PROJECT_ID, nonOwner.address, 3000),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't mint tokens to zero address`, async function () {
    const { jbToken } = await setup();
    await expect(jbToken.mint(PROJECT_ID, ethers.constants.AddressZero, 3000)).to.be.revertedWith(
      'ERC20: mint to the zero address',
    );
  });
});
