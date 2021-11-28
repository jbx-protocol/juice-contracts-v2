import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import { Contract } from 'ethers';

describe('JBTokenStore::issueFor(...)', function () {
  const PROJECT_ID = 2;

  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, jbProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);

    let jbTokenStoreFactory = await ethers.getContractFactory('JBTokenStore');
    let jbTokenStore = await jbTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      addrs,
      mockJbDirectory,
      jbTokenStore,
    };
  }

  it('Should issue tokens and emit event if caller is controller', async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let controller = addrs[1];
    let name = 'TestTokenDAO';
    let symbol = 'TEST';

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    let tx = await jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol);

    let tokenAddr = await jbTokenStore.connect(controller).tokenOf(PROJECT_ID);
    let token = new Contract(tokenAddr, jbToken.abi);

    expect(await token.connect(controller).name()).to.equal(name);
    expect(await token.connect(controller).symbol()).to.equal(symbol);

    await expect(tx)
      .to.emit(jbTokenStore, 'Issue')
      .withArgs(PROJECT_ID, tokenAddr, name, symbol, controller.address);
  });

  it(`Can't issue tokens if name is empty`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let controller = addrs[1];
    let name = '';
    let symbol = 'TEST';

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await expect(
      jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol),
    ).to.be.revertedWith('0x1f: EMPTY_NAME');
  });

  it(`Can't issue tokens if symbol is empty`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let controller = addrs[1];
    let name = 'TestTokenDAO';
    let symbol = '';

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await expect(
      jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol),
    ).to.be.revertedWith('0x20: EMPTY_SYMBOL');
  });

  it(`Can't issue tokens if already issued`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let controller = addrs[1];
    let name = 'TestTokenDAO';
    let symbol = 'TEST';

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // First issuance should succeed; second should fail.
    await expect(jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol)).to.not.be
      .reverted;
    await expect(
      jbTokenStore.connect(controller).issueFor(PROJECT_ID, name, symbol),
    ).to.be.revertedWith('0x21: ALREADY_ISSUED');
  });

  it(`Can't issue tokens if caller does not have permission`, async function () {
    const { addrs, mockJbDirectory, jbTokenStore } = await setup();
    let caller = addrs[1];
    let name = 'TestTokenDAO';
    let symbol = 'TEST';

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      jbTokenStore.connect(caller).issueFor(PROJECT_ID, name, symbol),
    ).to.be.revertedWith('0x4f: UNAUTHORIZED');
  });
});
