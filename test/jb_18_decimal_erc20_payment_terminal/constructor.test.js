import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';

import jbDirectory from '../../artifacts/contracts/JBDirectory.sol/JBDirectory.json';
import jb18DecimalPaymentTerminalStore from '../../artifacts/contracts/JB18DecimalPaymentTerminalStore.sol/JB18DecimalPaymentTerminalStore.json';
import jbOperatoreStore from '../../artifacts/contracts/JBOperatorStore.sol/JBOperatorStore.json';
import jbProjects from '../../artifacts/contracts/JBProjects.sol/JBProjects.json';
import jbSplitsStore from '../../artifacts/contracts/JBSplitsStore.sol/JBSplitsStore.json';
import jbToken from '../../artifacts/contracts/JBToken.sol/JBToken.json';

describe('JB18DecimalERC20PaymentTerminal::constructor(...)', function () {

  it("Can't deploy contract if erc20 doesnt have the target decimals", async function () {
    let [deployer, terminalOwner] =
      await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJB18DecimalPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken
    ] = await Promise.all([
      deployMockContract(deployer, jbDirectory.abi),
      deployMockContract(deployer, jb18DecimalPaymentTerminalStore.abi),
      deployMockContract(deployer, jbOperatoreStore.abi),
      deployMockContract(deployer, jbProjects.abi),
      deployMockContract(deployer, jbSplitsStore.abi),
      deployMockContract(deployer, jbToken.abi)
    ]);

    let jbErc20TerminalFactory = await ethers.getContractFactory('JB18DecimalERC20PaymentTerminal', deployer);
    const NON_ETH_TOKEN = mockJbToken.address;

    const DECIMALS1 = 1;
    const DECIMALS2 = 2;
    const CURRENCY = 2;
    const SPLITS_GROUP = 3;

    await mockJB18DecimalPaymentTerminalStore.mock.TARGET_DECIMALS.returns(DECIMALS1);
    await mockJbToken.mock.decimals.returns(DECIMALS2);

    await expect(
      jbErc20TerminalFactory
        .connect(deployer)
        .deploy(
          NON_ETH_TOKEN,
          CURRENCY,
          CURRENCY,
          SPLITS_GROUP,
          mockJbOperatorStore.address,
          mockJbProjects.address,
          mockJbDirectory.address,
          mockJbSplitsStore.address,
          mockJB18DecimalPaymentTerminalStore.address,
          terminalOwner.address,
        ),
    ).to.be.revertedWith(errors.TOKEN_MUST_USE_18_DECIMALS);
  });
});
