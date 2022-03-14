// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import './abstract/JBPaymentTerminalStore.sol';

/**
  @notice
  This contract manages all bookkeeping for inflows and outflows of a particular token for any IJBPaymentTerminal msg.sender.
*/
contract JB18DecimalPaymentTerminalStore is JBPaymentTerminalStore {
  //*********************************************************************//
  // --------------------------- public views -------------------------- //
  //*********************************************************************//

  function targetDecimals() public pure override returns (uint256) {
    return 18;
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /**
    @param _prices A contract that exposes price feeds.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _fundingCycleStore A contract storing all funding cycle configurations.
    @param _tokenStore A contract that manages token minting and burning.
  */
  constructor(
    IJBPrices _prices,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBFundingCycleStore _fundingCycleStore,
    IJBTokenStore _tokenStore
  )
    JBPaymentTerminalStore(_prices, _projects, _directory, _fundingCycleStore, _tokenStore)
  // solhint-disable-next-line no-empty-blocks
  {

  }
}