import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbToken721 from '../../artifacts/contracts/JBToken721.sol/JBToken721.json';
import errors from '../helpers/errors.json';

describe('JBToken721Store::issueFor(...)', function () {
  const PROJECT_ID = 2;
  const NFT_NAME = 'Reward NFT';
  const NFT_SYMBOL = 'RN';
  const NFT_URI = 'ipfs://';

  async function setup() {
    const [deployer, controller] = await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    const factory = await ethers.getContractFactory('JBToken721Store');
    const jbToken721Store = await factory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      controller,
      mockJbDirectory,
      jbToken721Store,
    };
  }

  it('Should issue tokens and emit event if caller is controller', async function () {
    const { controller, mockJbDirectory, jbToken721Store } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const tx = await jbToken721Store
      .connect(controller)
      .issueFor(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, NFT_URI);
    const r = await tx.wait();
    const tokenAddr = r.logs[0].address;

    const registeredAddr = await jbToken721Store.connect(controller).tokenOf(PROJECT_ID);
    expect(registeredAddr).to.equal(tokenAddr);

    expect(await jbToken721Store.projectOf(tokenAddr)).to.equal(PROJECT_ID);

    const token = new Contract(tokenAddr, jbToken721.abi);
    expect(await token.connect(controller).name()).to.equal(NFT_NAME);
    expect(await token.connect(controller).symbol()).to.equal(NFT_SYMBOL);

    await expect(tx)
      .to.emit(jbToken721Store, 'Issue')
      .withArgs(PROJECT_ID, tokenAddr, NFT_NAME, NFT_SYMBOL, 'ipfs://', controller.address);
  });

  it(`Can't issue tokens if name is empty`, async function () {
    const { controller, mockJbDirectory, jbToken721Store } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const name = '';
    await expect(
      jbToken721Store.connect(controller).issueFor(PROJECT_ID, name, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://'),
    ).to.be.revertedWith(errors.EMPTY_NAME);
  });

  it(`Can't issue tokens if symbol is empty`, async function () {
    const { controller, mockJbDirectory, jbToken721Store } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const symbol = '';
    await expect(
      jbToken721Store.connect(controller).issueFor(PROJECT_ID, NFT_NAME, symbol, NFT_URI, ethers.constants.AddressZero, 'ipfs://'),
    ).to.be.revertedWith(errors.EMPTY_SYMBOL);
  });

  it(`Can't issue tokens if already issued`, async function () {
    const { controller, mockJbDirectory, jbToken721Store } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // First issuance should succeed; second should fail.
    await expect(jbToken721Store.connect(controller).issueFor(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://')).to
      .not.be.reverted;
    await expect(
      jbToken721Store.connect(controller).issueFor(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://'),
    ).to.be.revertedWith(errors.PROJECT_ALREADY_HAS_TOKEN);
  });

  it(`Can't issue tokens if caller does not have permission`, async function () {
    const { controller, mockJbDirectory, jbToken721Store } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      jbToken721Store.connect(controller).issueFor(PROJECT_ID, NFT_NAME, NFT_SYMBOL, NFT_URI, ethers.constants.AddressZero, 'ipfs://'),
    ).to.be.revertedWith(errors.CONTROLLER_UNAUTHORIZED);
  });
});
