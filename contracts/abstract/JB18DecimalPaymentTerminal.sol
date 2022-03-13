// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './JBPaymentTerminal.sol';

abstract contract JB18DecimalPaymentTerminal is JBPaymentTerminal {
  constructor(
    address _token,
    uint256 _currency,
    uint256 _baseWeightCurrency,
    uint256 _payoutSplitsGroup,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    JB18DecimalPaymentTerminalStore _store,
    address _owner
  )
    JBPaymentTerminal(
      _token,
      _currency,
      _baseWeightCurrency,
      _payoutSplitsGroup,
      _operatorStore,
      _projects,
      _directory,
      _splitsStore,
      _store,
      _owner
    )
  {}
}
