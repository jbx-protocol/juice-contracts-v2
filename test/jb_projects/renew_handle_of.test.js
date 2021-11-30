import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('JBProjects::renewHandle(...)', function () {

  let jbOperatorStoreFactory;
  let jbOperatorStore;

  let jbProjectsFactory;
  let jbProjectsStore;

  let deployer;
  let projectOwner;
  let addrs;

  let projectHandle = "PROJECT_1";

  beforeEach(async function () {
    [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    jbOperatorStoreFactory = await ethers.getContractFactory('JBOperatorStore');
    jbOperatorStore = await jbOperatorStoreFactory.deploy();

    jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    jbProjectsStore = await jbProjectsFactory.deploy(jbOperatorStore.address);
  });

  it('Renew handle of project from non owner', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    await expect(
      jbProjectsStore
        .connect(deployer)
        .renewHandleOf(
            /*projectId=*/ 1,
        ),
    ).to.be.revertedWith('Operatable: UNAUTHORIZED');
  });

  it('Should renew handle', async function () {

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(projectHandle),
        /*metadataCid=*/ "",
      )

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .renewHandleOf(
          /*projectId=*/ 1,
      )

    await expect(tx)
      .to.emit(jbProjectsStore, 'RenewHandle')
      .withArgs(ethers.utils.formatBytes32String(projectHandle), 1, projectOwner.address)
  });

})