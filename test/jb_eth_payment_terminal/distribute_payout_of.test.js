import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../helpers/utils.js';
import errors from '../helpers/errors.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbEthPaymentTerminalStore from '../../artifacts/contracts/JBETHPaymentTerminalStore.sol/JBETHPaymentTerminalStore.json';

describe('JBETHPaymentTerminal::pay(...)', function () {
  const PROJECT_ID = 1;
  const AMOUNT_DISTRIBUTED = 100;
  const CURRENCY = 1;
  const MIN_TOKEN_REQUESTED = 90;
  const HANDLE = ethers.utils.formatBytes32String('PROJECT_HANDLE');



  const MEMO = 'Memo Test';
  const DELEGATE_METADATA = ethers.utils.randomBytes(32);
  const FUNDING_CYCLE_NUMBER = 1;
  const WEIGHT = 10;
  const TOKEN_RECEIVED = 100;
  const ETH_TO_PAY = ethers.utils.parseEther('1');

  async function setup() {
    let [deployer, terminalOwner, caller, beneficiary, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let promises = [];
    promises.push(deployMockContract(deployer, jbOperatoreStore.abi));
    promises.push(deployMockContract(deployer, jbProjects.abi));
    promises.push(deployMockContract(deployer, jbDirectory.abi));
    promises.push(deployMockContract(deployer, jbSplitsStore.abi));
    promises.push(deployMockContract(deployer, jbEthPaymentTerminalStore.abi));

    let [
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
      mockSplitsStore,
      mockJbEthPaymentTerminalStore,
    ] = await Promise.all(promises);

    let jbTerminalFactory = await ethers.getContractFactory("JBETHPaymentTerminal", deployer);

    const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
    const futureTerminalAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: currentNonce + 1 });

    await mockJbEthPaymentTerminalStore.mock.claimFor
      .withArgs(futureTerminalAddress)
      .returns();

    let jbEthPaymentTerminal = await jbTerminalFactory.connect(deployer).deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockSplitsStore.address,
      mockJbEthPaymentTerminalStore.address,
      terminalOwner.address);
    
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    
    await mockJbProjects.mock.handleOf.withArgs(PROJECT_ID).returns(HANDLE);

    await mockJbEthPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(
        PROJECT_ID,
        AMOUNT_DISTRIBUTED,
        CURRENCY,
        MIN_TOKEN_REQUESTED
      )
      .returns(
        { // mock JBFundingCycle obj 
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        AMOUNT_DISTRIBUTED
      )

    return {
      terminalOwner,
      caller,
      beneficiary,
      addrs,
      jbEthPaymentTerminal,
      mockJbEthPaymentTerminalStore,
      timestamp,
    }
  }

  it('Should distribute payout and emit event, without taking a fee if fee is 0', async function () {
    const { caller, jbEthPaymentTerminal, timestamp } = await setup();

  });

// without taking a fee if project is platform project's
// taking a fee
// should distribute and transfer remaining balance to projectowner


});
