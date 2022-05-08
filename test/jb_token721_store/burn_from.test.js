import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbToken721 from '../../artifacts/contracts/JBToken721.sol/JBToken721.json';
import errors from '../helpers/errors.json';

describe('jbToken721Store::burnFrom(...)', function () {
  const PROJECT_ID = 2;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, controller, newHolder] = await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    const jbToken721StoreFactory = await ethers.getContractFactory('JBToken721Store');
    const jbToken721Store = await jbToken721StoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      controller,
      newHolder,
      mockJbDirectory,
      jbToken721Store,
    };
  }

  /* Happy path tests with controller access */

  it('Should burn only claimed tokens and emit event', async function () {
    const { controller, newHolder, mockJbDirectory, jbToken721Store } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const tx = await jbToken721Store
      .connect(controller)
      .issueFor(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, '0x0000000000000000000000000000000000000000', NFT_URI);
    const r = await tx.wait();
    const tokenAddr = r.logs[0].address;

    expect(await jbToken721Store.projectOf(tokenAddr)).to.equal(PROJECT_ID);
    expect(await jbToken721Store.tokenOf(PROJECT_ID)).to.equal(tokenAddr);

    const token = new Contract(tokenAddr, jbToken721.abi);
    expect(await token.connect(controller).name()).to.equal(NFT_NAME);
    expect(await token.connect(controller).symbol()).to.equal(NFT_SYMBOL);

    await jbToken721Store.connect(controller).mintFor(newHolder.address, PROJECT_ID);
    expect(await token.connect(controller).ownerBalance(newHolder.address)).to.equal(1);
    expect(await token.connect(controller).isOwner(newHolder.address, 0)).to.equal(true);

    expect(await jbToken721Store.balanceOf(newHolder.address, PROJECT_ID)).to.equal(1);
    expect(await jbToken721Store.totalSupplyOf(PROJECT_ID)).to.equal(1);

    const burnFromTx = await jbToken721Store.connect(controller).burnFrom(newHolder.address, PROJECT_ID, 0);

    expect(await jbToken721Store.balanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await jbToken721Store.totalSupplyOf(PROJECT_ID)).to.equal(0);

    await expect(burnFromTx).to.emit(jbToken721Store, 'Burn').withArgs(newHolder.address, PROJECT_ID, 0, controller.address);
  });

  /* Sad path testing */

  it(`Can't burn tokens if caller doesn't have permission`, async function () {
    const { controller, newHolder, mockJbDirectory, jbToken721Store } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(jbToken721Store.connect(controller).burnFrom(newHolder.address, PROJECT_ID, 0))
      .to.be.revertedWith(errors.CONTROLLER_UNAUTHORIZED);
  });
});
