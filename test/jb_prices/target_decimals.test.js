import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBPrices::targetDecimals(...)', function () {
  it('Target decimals should equal 18', async function () {
    let [deployer, ..._] = await ethers.getSigners();

    let jbPricesFactory = await ethers.getContractFactory('JBPrices');
    let jbPrices = await jbPricesFactory.deploy(deployer.address);

    expect(await jbPrices.TARGET_DECIMALS()).to.equal(18);
  });
});
