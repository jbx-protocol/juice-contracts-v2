import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import interfaceSignatures from '../helpers/interface_signatures.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbTokenUriResolver from '../../artifacts/contracts/interfaces/IJBTokenUriResolver.sol/IJBTokenUriResolver.json';

describe('JBProjects::supportsInterface(...)', function () {
  async function setup() {
    let [deployer, caller] = await ethers.getSigners();

    let mockJbTokenUriResolver = await deployMockContract(deployer, jbTokenUriResolver.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, jbOperatoreStore.abi);

    let jbProjectsFactory = await ethers.getContractFactory('JBProjects');
    let jbProjects = await jbProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      deployer,
      caller,
      jbProjects,
      mockJbTokenUriResolver,
    };
  }

  it('Supports IERC165', async function () {
    const { jbProjects } = await setup();
    expect(
      await jbProjects.supportsInterface(interfaceSignatures.IERC165)
    ).to.equal(true);
  });

  it('Supports IERC721', async function () {
    const { jbProjects } = await setup();
    expect(
      await jbProjects.supportsInterface(interfaceSignatures.IERC721)
    ).to.equal(true);
  });

  it('Supports IERC721Metadata', async function () {
    const { jbProjects } = await setup();
    expect(
      await jbProjects.supportsInterface(interfaceSignatures.IERC721Metadata)
    ).to.equal(true);
  });

  it('Supports IJBOperatable', async function () {
    const { jbProjects } = await setup();
    expect(
      await jbProjects.supportsInterface(interfaceSignatures.IJBOperatable)
    ).to.equal(true);
  });

  it('Does not return true by default', async function () {
    const { jbProjects } = await setup();
    expect(
      await jbProjects.supportsInterface('0xffffffff')
    ).to.equal(false);
  });
});
