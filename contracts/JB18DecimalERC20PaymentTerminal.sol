// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

// Inheritance
import './abstract/JB18DecimalPaymentTerminal.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error TOKEN_MUST_USE_18_DECIMALS();

contract JB18DecimalERC20PaymentTerminal is JB18DecimalPaymentTerminal {
  constructor(
    IERC20Metadata _token,
    uint256 _currency,
    uint256 _baseWeightCurrency,
    uint256 _payoutSplitsGroup,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    JB18DecimalPaymentTerminalStore _store,
    IJBPrices _prices,
    address _owner
  )
    JB18DecimalPaymentTerminal(
      address(_token),
      _currency,
      _baseWeightCurrency,
      _payoutSplitsGroup,
      _operatorStore,
      _projects,
      _directory,
      _splitsStore,
      _prices,
      _store,
      _owner
    )
  {
    // Make sure the ERC20 uses 18 decimals.
    if (_token.decimals() != _store.targetDecimals()) revert TOKEN_MUST_USE_18_DECIMALS();
  }

  function _transferFrom(
    address _from,
    address payable _to,
    uint256 _amount
  ) internal override {
    _from == address(this)
      ? IERC20(token).transfer(_to, _amount)
      : IERC20(token).transferFrom(_from, _to, _amount);
  }

  function _beforeTransferTo(address _to, uint256 _amount) internal override {
    IERC20(token).approve(_to, _amount);
  }
}
