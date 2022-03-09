// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';

// Inheritance
import './JBPaymentTerminal.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//

contract JBETHPaymentTerminal is JBPaymentTerminal {
  constructor(
    uint256 _baseWeightCurrency,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    JBPaymentTerminalStore _store,
    address _owner
  )
    JBPaymentTerminal(
      JBTokens.ETH,
      JBCurrencies.ETH,
      _baseWeightCurrency,
      JBSplitsGroups.ETH_PAYOUT,
      _operatorStore,
      _projects,
      _directory,
      _splitsStore,
      _store,
      _owner
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  function _transferFrom(
    address _from,
    address payable _to,
    uint256 _amount
  ) internal override {
    Address.sendValue(_to, _amount);
  }

  // solhint-disable-next-line no-empty-blocks
  function _beforeTransferTo(address _to, uint256 _amount) internal override {}
}
