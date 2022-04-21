import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import ierc20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbTerminal from '../../artifacts/contracts/interfaces/IJBPayoutRedemptionPaymentTerminal.sol/IJBPayoutRedemptionPaymentTerminal.json';

describe('JBETHERC20SplitsPayer::supportsInterface(...)', function () {
  const DEFAULT_PROJECT_ID = 2;
  const DEFAULT_SPLITS_PROJECT_ID = 3;
  const DEFAULT_SPLITS_DOMAIN = 1;
  const DEFAULT_SPLITS_GROUP = 1;
  const DEFAULT_BENEFICIARY = ethers.Wallet.createRandom().address;
  const DEFAULT_PREFER_CLAIMED_TOKENS = false;
  const DEFAULT_MEMO = 'hello world';
  const DEFAULT_METADATA = [0x1];
  const PREFER_ADD_TO_BALANCE = false;

  async function setup() {
    let [deployer, owner, caller, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, jbDirectory.abi);
    let mockJbSplitsStore = await deployMockContract(deployer, jbSplitsStore.abi);
    let mockJbTerminal = await deployMockContract(deployer, jbTerminal.abi);
    let mockToken = await deployMockContract(deployer, ierc20.abi);

    let jbSplitsPayerFactory = await ethers.getContractFactory('JBETHERC20SplitsPayer');

    await mockJbSplitsStore.mock.directory.returns(mockJbDirectory.address);

    let jbSplitsPayer = await jbSplitsPayerFactory.deploy(
      DEFAULT_SPLITS_PROJECT_ID,
      DEFAULT_SPLITS_DOMAIN,
      DEFAULT_SPLITS_GROUP,
      mockJbSplitsStore.address,
      DEFAULT_PROJECT_ID,
      DEFAULT_BENEFICIARY,
      DEFAULT_PREFER_CLAIMED_TOKENS,
      DEFAULT_MEMO,
      DEFAULT_METADATA,
      PREFER_ADD_TO_BALANCE,
      owner.address,
    );

    return {
      deployer,
      caller,
      owner,
      addrs,
      mockToken,
      mockJbDirectory,
      mockJbTerminal,
      mockJbSplitsStore,
      jbSplitsPayer,
    };
  }

  it('Supports IERC165', async function () {
    const { jbSplitsPayer } = await setup();

    const interfaceId = '0x01ffc9a7';
    expect(await jbSplitsPayer.supportsInterface(interfaceId)).to.equal(true);
  });

  it('Supports IJBSplitsPayer', async function () {
    const { jbSplitsPayer } = await setup();

    const interfaceId = '0x989785b6';
    expect(await jbSplitsPayer.supportsInterface(interfaceId)).to.equal(true);
  });

  it('Supports IJBProjectPayer', async function () {
    const { jbSplitsPayer } = await setup();

    const interfaceId = '0x78b19768';
    expect(await jbSplitsPayer.supportsInterface(interfaceId)).to.equal(true);
  });

  it('Does not return true by default', async function () {
    const { jbSplitsPayer } = await setup();

    const interfaceId = '0xffffffff';
    expect(await jbSplitsPayer.supportsInterface(interfaceId)).to.equal(false);
  });
});
