import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from '@ethersproject/bignumber';

describe('JBProjects::setMetadataCidOf(...)', function () {

  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let jbProjectsFactory;
  let jbProjectsStore;

  let deployer;
  let projectOwner;
  let addrs;

  let projectHandle = "PROJECT_1";
  let metadataCid = "ipfs://randommetadatacidipsaddress";
  let projectId = ethers.BigNumber.from(1);

  beforeEach(async function () {
    [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);
  });

  it('Set MetadataCid', async function () {

    const projectId = await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ deployer.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ metadataCid,
      )

    let tx = await jbProjectsStore
      .connect(deployer)
      .setMetadataCidOf(
        /*projectId=*/ 1,
        /*metadataCid=*/ metadataCid,
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'SetUri')
      .withArgs(1, metadataCid, deployer.address)
  });
})