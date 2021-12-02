import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';

describe('JBProjects::setMetadataCidOf(...)', function () {
  const PROJECT_HANDLE = 'PROJECT_1';
  const METADATA_CID = '';
  const METADATA_CID_2 = 'ipfs://randommetadatacidipsaddress';
  const PROJECT_ID = 1;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);
    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjectsStore = await jbProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      jbProjectsStore,
    };
  }

  it('Should set MetadataCid on project', async function () {
    const { projectOwner, deployer, jbProjectsStore } = await setup();

    await jbProjectsStore
      .connect(deployer)
      .createFor(
        /*owner=*/ projectOwner.address,
        /*handle=*/ ethers.utils.formatBytes32String(PROJECT_HANDLE),
        /*metadataCid=*/ METADATA_CID,
      );

    let tx = await jbProjectsStore
      .connect(projectOwner)
      .setMetadataCidOf(/*projectId=*/ PROJECT_ID, /*metadataCid=*/ METADATA_CID_2);


    let storedMetadataCid = await jbProjectsStore.connect(deployer).metadataCidOf(PROJECT_ID);
    await expect(storedMetadataCid).to.equal(METADATA_CID_2);

    await expect(tx)
      .to.emit(jbProjectsStore, 'SetUri')
      .withArgs(PROJECT_ID, METADATA_CID_2, projectOwner.address);
  });
});
