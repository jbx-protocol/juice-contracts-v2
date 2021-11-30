import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::claimHandle(...)', function () {

  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let jbProjectsFactory;
  let jbProjectsStore;

  let deployer;
  let projectOwner;
  let addrs;

  let projectHandle = "PROJECT_1";
  let projectHandleNotTaken = "PROJECT_2"
  let emptyProjectHandle = "";
  let metadataCid = "";

  beforeEach(async function () {
    [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);
  });

  // Working on these now

  // it('Should reject with Unauthorized', async function () {

  //   await jbProjectsStore
  //     .connect(deployer)
  //     .createFor(
  //       /*owner=*/ projectOwner.address,
  //       /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
  //       /*metadataCid=*/ metadataCid,
  //     )

  //   await expect(
  //     jbProjectsStore
  //       .connect(deployer)
  //       .claimHandle(
  //         /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
  //         /*address=*/ projectOwner.address,
  //         /*projectId=*/ 1,
  //       ),
  //   ).to.be.revertedWith('0x0c: UNAUTHORIZED');
  // });

  // it('Should claim handle from another project', async function () {

  //   await jbProjectsStore
  //     .connect(deployer)
  //     .createFor(
  //       /*owner=*/ projectOwner.address,
  //       /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
  //       /*metadataCid=*/ "",
  //     )

  //   let tx = await jbProjectsStore
  //     .connect(projectOwner)
  //     .claimHandle(
  //         /*projectId=*/ 1,
  //         /*address=*/ deployer.address,
  //         /*handle=*/ ethers.utils.formatBytes32String(projectHandleNotTaken)
  //     )

  //   await expect(tx)
  //     .to.emit(jbProjectsStore, 'ClaimHandle')
  //     .withArgs(1, deployer.address, ethers.utils.formatBytes32String(projectHandle), ethers.utils.formatBytes32String(projectHandleNotTaken), projectOwner.address)
  // });


})