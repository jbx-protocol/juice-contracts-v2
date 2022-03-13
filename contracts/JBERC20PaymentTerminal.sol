// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

// Inheritance
import './abstract/JBPaymentTerminal.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error TOKEN_DECIMALS_MUST_MATCH();

contract JBERC20PaymentTerminal is JBPaymentTerminal {
  constructor(
    IERC20Metadata _token,
    uint256 _decimals,
    uint256 _currency,
    uint256 _baseWeightCurrency,
    uint256 _payoutSplitsGroup,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    IJBPrices _prices,
    JBPaymentTerminalStore _store,
    address _owner
  )
    JBPaymentTerminal(
      address(_token),
      _decimals,
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
    // Make sure the ERC20 has the specified number of decimals.
    if (_token.decimals() != _decimals) revert TOKEN_DECIMALS_MUST_MATCH();
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
