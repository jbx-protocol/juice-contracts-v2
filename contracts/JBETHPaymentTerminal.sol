// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Address.sol';

// Inheritance
import './abstract/JB18DecimalPaymentTerminal.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//

contract JBETHPaymentTerminal is JB18DecimalPaymentTerminal {
  constructor(
    uint256 _baseWeightCurrency,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    JB18DecimalPaymentTerminalStore _store,
    address _owner
  )
    JB18DecimalPaymentTerminal(
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
    address,
    address payable _to,
    uint256 _amount
  ) internal override {
    Address.sendValue(_to, _amount);
  }

  // solhint-disable-next-line no-empty-blocks
  function _beforeTransferTo(address _to, uint256 _amount) internal override {}
}
