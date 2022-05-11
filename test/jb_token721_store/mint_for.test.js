import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import errors from '../helpers/errors.json';

describe('JBToken721Store::mintFor(...)', function () {
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

  it('Should mint claimed tokens and emit event if caller is controller', async function () {
    const { controller, newHolder, mockJbDirectory, jbToken721Store } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await jbToken721Store.connect(controller).issueFor(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, '0x0000000000000000000000000000000000000000', NFT_URI);

    const mintForTx = await jbToken721Store.connect(controller).mintFor(newHolder.address, PROJECT_ID);

    expect(await jbToken721Store.balanceOf(newHolder.address, PROJECT_ID)).to.equal(1);

    await expect(mintForTx)
      .to.emit(jbToken721Store, 'Mint')
      .withArgs(
        newHolder.address,
        PROJECT_ID,
        0,
        1,
        controller.address,
      );
  });

  it(`Can't mint tokens if caller does not have permission`, async function () {
    const { newHolder, mockJbDirectory, jbToken721Store } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(jbToken721Store.mintFor(newHolder.address, PROJECT_ID)).to.be.revertedWith(errors.CONTROLLER_UNAUTHORIZED);
  });
});
