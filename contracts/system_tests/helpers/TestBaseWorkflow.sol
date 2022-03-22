// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './hevm.sol';
import '../../../lib/ds-test/src/test.sol';

import '../../JBController.sol';
import '../../JBDirectory.sol';
import '../../JBETHPaymentTerminal.sol';
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

import '../../interfaces/IJBPayoutRedemptionPaymentTerminal.sol';
import '../../interfaces/IJBToken.sol';

// Base contract for Juicebox system tests.
//
// Provides common functionality, such as deploying contracts on test setup.
contract TestBaseWorkflow is DSTest {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  // Multisig address used for testing.
  address private _multisig = address(123);

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
  // JBTokenStore
  JBTokenStore private _jbTokenStore;
  // JBSplitsStore
  JBSplitsStore private _jbSplitsStore;
  // JBController
  JBController private _jbController;
  // JBPaymentTerminalStore
  JBPaymentTerminalStore private _jbPaymentTerminalStore;
  // JBETHPaymentTerminal
  JBETHPaymentTerminal private _jbETHPaymentTerminal;

  //*********************************************************************//
  // ------------------------- internal views -------------------------- //
  //*********************************************************************//

  function multisig() internal view returns (address) {
    return _multisig;
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

  //*********************************************************************//
  // --------------------------- test setup ---------------------------- //
  //*********************************************************************//

  // Deploys and initializes contracts for testing.
  function setUp() public virtual {
    // Labels
    evm.label(_multisig, 'multisig');

    // JBOperatorStore
    _jbOperatorStore = new JBOperatorStore();
    // JBProjects
    _jbProjects = new JBProjects(_jbOperatorStore);
    // JBPrices
    _jbPrices = new JBPrices(_multisig);
    // JBDirectory
    _jbDirectory = new JBDirectory(_jbOperatorStore, _jbProjects);
    // JBFundingCycleStore
    _jbFundingCycleStore = new JBFundingCycleStore(_jbDirectory);
    // JBTokenStore
    _jbTokenStore = new JBTokenStore(_jbOperatorStore, _jbProjects, _jbDirectory);
    // JBSplitsStore
    _jbSplitsStore = new JBSplitsStore(_jbOperatorStore, _jbProjects, _jbDirectory);
    // JBController
    _jbController = new JBController(
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbFundingCycleStore,
      _jbTokenStore,
      _jbSplitsStore
    );
    _jbDirectory.setIsAllowedToSetFirstController(address(_jbController), true);
    // JBPaymentTerminalStore
    _jbPaymentTerminalStore = new JBPaymentTerminalStore(
      _jbPrices,
      _jbProjects,
      _jbDirectory,
      _jbFundingCycleStore,
      _jbTokenStore
    );
    // JBETHPaymentTerminal
    _jbETHPaymentTerminal = new JBETHPaymentTerminal(
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbSplitsStore,
      _jbPaymentTerminalStore,
      _multisig
    );
  }
}
