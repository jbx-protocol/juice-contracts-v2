import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBToken::burn(...)', function () {
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

  it('Should burn token and emit event if caller is owner', async function () {
    const { deployer, addrs, testToken } = await setup();
    const addr = addrs[1];
    const numTokens = 5;
    const burnTx = await testToken.connect(deployer).burn(PROJECT_ID, addr.address, numTokens);

    await expect(burnTx).to.emit(testToken, 'Transfer');

    // overloaded functions need to be called using the full function signature
    const balance = await testToken['balanceOf(uint256,address)'](PROJECT_ID, addr.address);
    expect(balance).to.equal(startingBalance - numTokens);
  });

  it(`Can't burn tokens if caller isn't owner`, async function () {
    const { addrs, testToken } = await setup();
    const nonOwner = addrs[1];
    await expect(
      testToken.connect(nonOwner).burn(PROJECT_ID, nonOwner.address, 3000),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't burn tokens from zero address`, async function () {
    const { testToken } = await setup();
    const zeroAddr = ethers.constants.AddressZero;
    await expect(testToken.burn(PROJECT_ID, zeroAddr, 3000)).to.be.revertedWith(
      'ERC20: burn from the zero address',
    );
  });

  it(`Can't burn tokens if burn amount exceeds balance`, async function () {
    const { addrs, testToken } = await setup();
    const addr = addrs[1];
    const numTokens = 9001;
    await expect(testToken.burn(PROJECT_ID, addr.address, numTokens)).to.be.revertedWith(
      'ERC20: burn amount exceeds balance',
    );
  });
});
