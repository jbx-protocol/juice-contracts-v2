// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './JBPaymentTerminal.sol';

abstract contract JB18DecimalPaymentTerminal is JBPaymentTerminal {
  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//

  /**
    @notice
    The contract that exposes price feeds.
  */
  IJBPrices public immutable prices;

  /**
    @notice
    Gets the current overflowed amount in this for a specified project, in terms of ETH.

    @dev
    The current overflow is represented as a fixed point number with 18 decimals.

    @param _projectId The ID of the project to get overflow for.

    @return The current amount of ETH overflow that project has in this terminal, as a fixed point number with 18 decimals.
  */
  function currentEthOverflowOf(uint256 _projectId) external view override returns (uint256) {
    uint256 _overflow = store.currentOverflowOf(this, _projectId);
    if (currency == JBCurrencies.ETH) return _overflow;
    else {
      uint256 _targetDecimals = store.targetDecimals();
      return
        PRBMath.mulDiv(
          _overflow,
          10**_targetDecimals,
          prices.priceFor(currency, JBCurrencies.ETH, _targetDecimals)
        );
    }
  }

  constructor(
    address _token,
    uint256 _currency,
    uint256 _baseWeightCurrency,
    uint256 _payoutSplitsGroup,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    IJBPrices _prices,
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
  {
    prices = _prices;
  }
}