import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('LogPublisher events', function () {
  async function setup() {
    let [deployer, ...accounts] = await ethers.getSigners();

    let logPublisherFactory = await ethers.getContractFactory('LogPublisher');
    let logPublisher = await logPublisherFactory.deploy();

    return {
      deployer,
      accounts,
      logPublisher
    };
  }

  it(`Should emit a Data event`, async function () {
    const { logPublisher } = await setup();

    await expect(logPublisher.publishData('0x00'))
      .to.emit(logPublisher, 'Data')
      .withArgs('0x00');
  });

  it(`Should emit an AddressedData event`, async function () {
    const { accounts, logPublisher } = await setup();

    await expect(logPublisher.publishAddressedData(accounts[0].address, '0x00'))
      .to.emit(logPublisher, 'AddressedData')
      .withArgs(accounts[0].address, '0x00');
  });

  it(`Should emit a DescribedData event`, async function () {
    const { logPublisher } = await setup();

    await expect(logPublisher.publishDescribedData('0x00', '0x00'))
      .to.emit(logPublisher, 'DescribedData')
      .withArgs('0x00', '0x00');
  });

  it(`Should emit an AddressedDescribedData event`, async function () {
    const { accounts, logPublisher } = await setup();

    await expect(logPublisher.publishAddressedDescribedData(accounts[0].address, '0x00', '0x00'))
      .to.emit(logPublisher, 'AddressedDescribedData')
      .withArgs(accounts[0].address, '0x00', '0x00');
  });
});
