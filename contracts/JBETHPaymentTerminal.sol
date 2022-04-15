// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';
import './abstract/JBPayoutRedemptionPaymentTerminal.sol';

/**
  @notice
  Manages all inflows and outflows of ETH funds into the protocol ecosystem.

  @dev
  Inherits from:
  JBPayoutRedemptionPaymentTerminal: Generic terminal managing all inflows and outflows of funds into the protocol ecosystem.
*/
contract JBETHPaymentTerminal is JBPayoutRedemptionPaymentTerminal {
  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  constructor(
    uint256 _baseWeightCurrency,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    IJBPrices _prices,
    IJBPaymentTerminalStore _store,
    address _owner
  )
    JBPayoutRedemptionPaymentTerminal(
      JBTokens.ETH,
      18, // 18 decimals.
      JBCurrencies.ETH,
      _baseWeightCurrency,
      JBSplitsGroups.ETH_PAYOUT,
      _operatorStore,
      _projects,
      _directory,
      _splitsStore,
      _prices,
      _store,
      _owner
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  //*********************************************************************//
  // ---------------------- internal transactions ---------------------- //
  //*********************************************************************//

  /** 
    @notice
    Transfers tokens.

    ignored: _from The address from which the transfer should originate.
    @param _to The address to which the transfer should go.
    @param _amount The amount of the transfer, as a fixed point number with the same number of decimals as this terminal.
  */
  function _transferFrom(
    address,
    address payable _to,
    uint256 _amount
  ) internal override {
    Address.sendValue(_to, _amount);
  }

  /** 
    @notice
    Logic to be triggered before transferring tokens from this terminal.

    ignored: _to The address to which the transfer is going.
    ignored: _amount The amount of the transfer, as a fixed point number with the same number of decimals as this terminal.
  */
  // solhint-disable-next-line no-empty-blocks
  function _beforeTransferTo(address, uint256) internal override {}
}
