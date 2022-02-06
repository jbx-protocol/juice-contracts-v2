// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './DSTest.sol';
import './hevm.sol';

import '../../JBController.sol';
import '../../JBDirectory.sol';
import '../../JBETHPaymentTerminal.sol';
import '../../JBETHPaymentTerminalStore.sol';
import '../../JBFundingCycleStore.sol';
import '../../JBOperatorStore.sol';
import '../../JBPrices.sol';
import '../../JBProjects.sol';
import '../../JBSplitsStore.sol';
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

import '../../interfaces/IJBTerminal.sol';

// Base contract for Juicebox system tests.
//
// Provides common functionality, such as deploying contracts on test setup
// and jbx-tailored asserts (comùparing structs for instance)
abstract contract TestBaseWorkflow is DSTest {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  // Multisig address used for testing.
  address private _multisig = address(123);

  // EVM Cheat codes - test addresses via prank and startPrank in hevm
  Hevm public evm = Hevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

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
  // JBETHPaymentTerminalStore
  JBETHPaymentTerminalStore private _jbETHPaymentTerminalStore;
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

  function jbETHPaymentTerminalStore() internal view returns (JBETHPaymentTerminalStore) {
    return _jbETHPaymentTerminalStore;
  }

  function jbETHPaymentTerminal() internal view returns (JBETHPaymentTerminal) {
    return _jbETHPaymentTerminal;
  }

  //*********************************************************************//
  // --------------------------- test setup ---------------------------- //
  //*********************************************************************//

  // Deploys and initializes contracts for testing.
  function setUp() public virtual {
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
    _jbDirectory.addToSetControllerAllowlist(address(_jbController));
    // JBETHPaymentTerminalStore
    _jbETHPaymentTerminalStore = new JBETHPaymentTerminalStore(
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
      _jbETHPaymentTerminalStore,
      _multisig
    );
  }

  // Compare to JBFundingCycle struct
  function assertEqFundingCycle(JBFundingCycle memory a, JBFundingCycle memory b) internal {
      if(
        a.number != b.number ||
        a.configuration != b.configuration ||
        a.basedOn != b.basedOn ||
        a.start != b.start ||
        a.duration != b.duration ||
        a.weight != b.weight ||
        a.discountRate != b.discountRate ||
        a.ballot != b.ballot ||
        a.metadata != b.metadata) {
          emit log('JBFungingCycle a != b');
          emit log('use test --vvv for more details');
          fail();
        }
  }

  function assertEqSplit(JBSplit memory a, JBSplit memory b) internal {
      if(
        a.preferClaimed != b.preferClaimed ||
        a.percent != b.percent ||
        a.projectId != b.projectId ||
        a.beneficiary != b.beneficiary ||
        a.lockedUntil != b.lockedUntil ||
        a.allocator != b.allocator) {
          emit log('JBSplit a != b');
          emit log('use test --vvv for more details');
          fail();
        }
  }
  
}
