// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './hevm.sol';
import '../../../lib/ds-test/src/test.sol';

import '../../JBController.sol';
import '../../JBDirectory.sol';
import '../../JBETHPaymentTerminal.sol';
import '../../JBERC20PaymentTerminal.sol';
import '../../JBPaymentTerminalStore.sol';
import '../../JBFundingCycleStore.sol';
import '../../JBOperatorStore.sol';
import '../../JBPrices.sol';
import '../../JBProjects.sol';
import '../../JBSplitsStore.sol';
import '../../JBToken.sol';
import '../../JBTokenStore.sol';

import '../../structs/JBDidPayData.sol';
import '../../structs/JBDidRedeemData.sol';
import '../../structs/JBFee.sol';
import '../../structs/JBFundAccessConstraints.sol';
import '../../structs/JBFundingCycle.sol';
import '../../structs/JBFundingCycleData.sol';
import '../../structs/JBFundingCycleMetadata.sol';
import '../../structs/JBGroupedSplits.sol';
import '../../structs/JBOperatorData.sol';
import '../../structs/JBPayParamsData.sol';
import '../../structs/JBProjectMetadata.sol';
import '../../structs/JBRedeemParamsData.sol';
import '../../structs/JBSplit.sol';

import '../../interfaces/IJBPaymentTerminal.sol';
import '../../interfaces/IJBToken.sol';

import './AccessJBLib.sol';

import '@paulrberg/contracts/math/PRBMath.sol';


// Base contract for Juicebox system tests.
//
// Provides common functionality, such as deploying contracts on test setup.
contract TestBaseWorkflow is DSTest {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  // Multisig address used for testing.
  address private _multisig = address(123);

  address private _beneficiary = address(69420);

  // EVM Cheat codes - test addresses via prank and startPrank in hevm
  Hevm public evm = Hevm(HEVM_ADDRESS);

  // JBOperatorStore
  JBOperatorStore private _jbOperatorStore;
  // JBProjects
  JBProjects private _jbProjects;
  // JBPrices
  JBPrices private _jbPrices;
  // JBDirectory
  JBDirectory private _jbDirectory;
  // JBFundingCycleStore
  JBFundingCycleStore private _jbFundingCycleStore;
  // JBToken
  JBToken private _jbToken;
  // JBTokenStore
  JBTokenStore private _jbTokenStore;
  // JBSplitsStore
  JBSplitsStore private _jbSplitsStore;
  // JBController
  JBController private _jbController;
  // JBETHPaymentTerminalStore
  JBPaymentTerminalStore private _jbPaymentTerminalStore;
  // JBETHPaymentTerminal
  JBETHPaymentTerminal private _jbETHPaymentTerminal;
  // JBERC20PaymentTerminal
  JBERC20PaymentTerminal private _jbERC20PaymentTerminal;
  // AccessJBLib
  AccessJBLib private _accessJBLib;

  //*********************************************************************//
  // ------------------------- internal views -------------------------- //
  //*********************************************************************//

  function multisig() internal view returns (address) {
    return _multisig;
  }

  function beneficiary() internal view returns (address) {
    return _beneficiary;
  }

  function jbOperatorStore() internal view returns (JBOperatorStore) {
    return _jbOperatorStore;
  }

  function jbProjects() internal view returns (JBProjects) {
    return _jbProjects;
  }

  function jbPrices() internal view returns (JBPrices) {
    return _jbPrices;
  }

  function jbDirectory() internal view returns (JBDirectory) {
    return _jbDirectory;
  }

  function jbFundingCycleStore() internal view returns (JBFundingCycleStore) {
    return _jbFundingCycleStore;
  }

  function jbTokenStore() internal view returns (JBTokenStore) {
    return _jbTokenStore;
  }

  function jbSplitsStore() internal view returns (JBSplitsStore) {
    return _jbSplitsStore;
  }

  function jbController() internal view returns (JBController) {
    return _jbController;
  }

  function jbPaymentTerminalStore() internal view returns (JBPaymentTerminalStore) {
    return _jbPaymentTerminalStore;
  }

  function jbETHPaymentTerminal() internal view returns (JBETHPaymentTerminal) {
    return _jbETHPaymentTerminal;
  }

  function jbERC20PaymentTerminal() internal view returns (JBERC20PaymentTerminal) {
    return _jbERC20PaymentTerminal;
  }

  function jbToken() internal view returns (JBToken) {
    return _jbToken;
  }

  function jbLibraries() internal view returns(AccessJBLib) {
    return _accessJBLib;
  }

  //*********************************************************************//
  // --------------------------- test setup ---------------------------- //
  //*********************************************************************//

  // Deploys and initializes contracts for testing.
  function setUp() public virtual {
    // Labels
    evm.label(_multisig, 'projectOwner');
    evm.label(_beneficiary, 'beneficiary');

    // JBOperatorStore
    _jbOperatorStore = new JBOperatorStore();
    evm.label(address(_jbOperatorStore), 'JBOperatorStore');

    // JBProjects
    _jbProjects = new JBProjects(_jbOperatorStore);
    evm.label(address(_jbProjects), 'JBProjects');

    // JBPrices
    _jbPrices = new JBPrices(_multisig);
    evm.label(address(_jbPrices), 'JBPrices');

    // JBDirectory
    _jbDirectory = new JBDirectory(_jbOperatorStore, _jbProjects, _jbFundingCycleStore, _multisig);
    evm.label(address(_jbDirectory), 'JBDirectory');

    // JBFundingCycleStore
    _jbFundingCycleStore = new JBFundingCycleStore(_jbDirectory);
    evm.label(address(_jbFundingCycleStore), 'JBFundingCycleStore');

    // JBTokenStore
    _jbTokenStore = new JBTokenStore(_jbOperatorStore, _jbProjects, _jbDirectory);
    evm.label(address(_jbTokenStore), 'JBTokenStore');

    // JBSplitsStore
    _jbSplitsStore = new JBSplitsStore(_jbOperatorStore, _jbProjects, _jbDirectory);
    evm.label(address(_jbSplitsStore), 'JBSplitsStore');

    // JBController
    _jbController = new JBController(
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbFundingCycleStore,
      _jbTokenStore,
      _jbSplitsStore
    );
    evm.label(address(_jbController), 'JBController');

    evm.prank(_multisig);
    _jbDirectory.setIsAllowedToSetFirstController(address(_jbController), true);
    // JBETHPaymentTerminalStore
    _jbPaymentTerminalStore = new JBPaymentTerminalStore(
      _jbPrices,
      _jbDirectory,
      _jbFundingCycleStore
    );
    evm.label(address(_jbPaymentTerminalStore), 'JBPaymentTerminalStore');

    // AccessJBLib
    _accessJBLib = new AccessJBLib();

    // JBETHPaymentTerminal
    _jbETHPaymentTerminal = new JBETHPaymentTerminal(
      _accessJBLib.ETH(),
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbSplitsStore,
      _jbPrices,
      _jbPaymentTerminalStore,
      _multisig
    );
    evm.label(address(_jbETHPaymentTerminal), 'JBETHPaymentTerminal');

    evm.prank(_multisig);
    _jbToken = new JBToken('MyToken', 'MT');

    evm.prank(_multisig);
    _jbToken.mint(0, _multisig, 100*10**18);

    // JBERC20PaymentTerminal
    _jbERC20PaymentTerminal = new JBERC20PaymentTerminal(
      _jbToken,
      _accessJBLib.ETH(), // currency
      _accessJBLib.ETH(), // base weight currency
      1, // JBSplitsGroupe
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbSplitsStore,
      _jbPrices,
      _jbPaymentTerminalStore,
      _multisig
    );
    evm.label(address(_jbERC20PaymentTerminal), 'JBERC20PaymentTerminal');
  }
}
