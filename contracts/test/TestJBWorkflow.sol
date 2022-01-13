// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../JBController.sol';
import './../JBDirectory.sol';
import './../JBETHPaymentTerminal.sol';
import './../JBETHPaymentTerminalStore.sol';
import './../JBFundingCycleStore.sol';
import './../JBOperatorStore.sol';
import './../JBPrices.sol';
import './../JBProjects.sol';
import './../JBSplitsStore.sol';
import './../JBTokenStore.sol';

contract TestJBWorkflow {
  // Multisig address used for testing.
  // TODO: figure out how mock testing addresses work.
  address private _multisig = address(123);

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
  JBController jbController;
  // JBETHPaymentTerminalStore
  JBETHPaymentTerminalStore private _jbEthPaymentTerminalStore;
  // JBETHPaymentTerminal
  JBETHPaymentTerminal private _jbEthPaymentTerminal;

  // Deploys and initializes contracts for testing.
  function setUp() public {
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
    jbController = new JBController(
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbFundingCycleStore,
      _jbTokenStore,
      _jbSplitsStore
    );
    _jbDirectory.addToSetControllerAllowlist(address(jbController));
    // JBETHPaymentTerminalStore
    _jbEthPaymentTerminalStore = new JBETHPaymentTerminalStore(
      _jbPrices,
      _jbProjects,
      _jbDirectory,
      _jbFundingCycleStore,
      _jbTokenStore
    );
    // JBETHPaymentTerminal
    _jbEthPaymentTerminal = new JBETHPaymentTerminal(
      _jbOperatorStore,
      _jbProjects,
      _jbDirectory,
      _jbSplitsStore,
      _jbEthPaymentTerminalStore,
      _multisig
    );
  }

  function testDeployContracts() public {
    // do nothing... for now...
  }
}
