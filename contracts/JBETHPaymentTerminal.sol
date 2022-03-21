// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';

// Inheritance
import './abstract/JBPayoutRedemptionPaymentTerminal.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//

contract JBETHPaymentTerminal is JBPayoutRedemptionPaymentTerminal {
  constructor(
    uint256 _baseWeightCurrency,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    IJBPrices _prices,
    JBPaymentTerminalStore _store,
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

  function _transferFrom(
    address,
    address payable _to,
    uint256 _amount
  ) internal override {
    Address.sendValue(_to, _amount);
  }

  // solhint-disable-next-line no-empty-blocks
  function _beforeTransferTo(address _to, uint256 _amount) internal override {}
}
