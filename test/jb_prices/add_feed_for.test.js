import { expect } from 'chai';
import { ethers } from 'hardhat';
import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

describe('JBPrices::addFeed(...)', function () {
  let deployer;
  let addrs;

  let aggregatorV3Contract;

  let jbPricesFactory;
  let jbPrices;

  beforeEach(async function () {
    [deployer, ...addrs] = await ethers.getSigners();

    aggregatorV3Contract = await deployMockContract(deployer, compilerOutput.abi);

    jbPricesFactory = await ethers.getContractFactory('JBPrices');
    jbPrices = await jbPricesFactory.deploy(deployer.address);
  });

  it('Add feed from owner succeeds, but fails if added again', async function () {
    let currency = 1;
    let base = 2;

    // Add a feed for an arbitrary currency.
    let tx = await jbPrices
      .connect(deployer)
      .addFeedFor(currency, base, aggregatorV3Contract.address);

    // Expect an event to have been emitted.
    await expect(tx)
      .to.emit(jbPrices, 'AddFeed')
      .withArgs(currency, base, aggregatorV3Contract.address);

    // Get the stored feed.
    const storedFeed = await jbPrices.feedFor(currency, base);

    // Expect the stored feed values to match.
    expect(storedFeed).to.equal(aggregatorV3Contract.address);

    // Try to add the same feed again. It should fail with an error indicating that it already
    // exists.
    await expect(
      jbPrices.connect(deployer).addFeedFor(currency, base, aggregatorV3Contract.address),
    ).to.be.revertedWith('ALREADY_EXISTS()');
  });

  it('Add feed from address other than owner fails', async function () {
    await expect(
      jbPrices
        .connect(addrs[0]) // Arbitrary address.
        .addFeedFor(/*currency=*/ 1, /*base=*/ 2, aggregatorV3Contract.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
