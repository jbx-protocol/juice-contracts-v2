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
    return
      currency == JBCurrencies.ETH
        ? _overflow
        : PRBMathUD60x18.div(
          _overflow,
          store.prices().priceFor(currency, JBCurrencies.ETH, store.TARGET_DECIMALS())
        );
  }

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
      _store,
      _owner
    )
  {
    // Make sure the ERC20 uses 18 decimals.
    if (_token.decimals() != _store.TARGET_DECIMALS()) revert TOKEN_MUST_USE_18_DECIMALS();
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
