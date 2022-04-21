import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import interfaceSignatures from '../helpers/interface_signatures.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbFundingCycleStore from '../../artifacts/contracts/JBFundingCycleStore.sol/JBFundingCycleStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';
import jbTokenStore from '../../artifacts/contracts/JBTokenStore.sol/JBTokenStore.json';

describe('JBController::supportsInterface(...)', function () {
  let ISSUE_PERMISSION_INDEX;

  before(async function () {
    let jbOperationsFactory = await ethers.getContractFactory('JBOperations');
    let jbOperations = await jbOperationsFactory.deploy();

    ISSUE_PERMISSION_INDEX = await jbOperations.ISSUE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jbFundingCycleStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi),
      deployMockContract(deployer, jbTokenStore.abi),
    ]);

    let jbControllerFactory = await ethers.getContractFactory('JBController');
    let jbController = await jbControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
    );

    return {
      projectOwner,
      deployer,
      addrs,
      jbController,
      mockJbTokenStore,
      mockJbToken,
      mockJbOperatorStore,
    };
  }

  it('Supports IERC165', async function () {
    const { jbController } = await setup();
    expect(
      await jbController.supportsInterface(interfaceSignatures.IERC165)
    ).to.equal(true);
  });

  it('Supports IJBController', async function () {
    const { jbController } = await setup();
    expect(
      await jbController.supportsInterface(interfaceSignatures.IJBController)
    ).to.equal(true);
  });

  it('Supports IJBOperatable', async function () {
    const { jbController } = await setup();
    expect(
      await jbController.supportsInterface(interfaceSignatures.IJBOperatable)
    ).to.equal(true);
  });

  it('Does not return true by default', async function () {
    const { jbController } = await setup();
    expect(
      await jbController.supportsInterface('0xffffffff')
    ).to.equal(false);
  });
});
