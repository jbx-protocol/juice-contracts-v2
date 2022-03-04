// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

// Inheritance
import './JBPaymentTerminal.sol';

contract JBERC20PaymentTerminal is JBPaymentTerminal {
  constructor(
    IERC20 _token,
    uint256 _currency,
    uint256 _baseWeightCurrency,
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory,
    IJBSplitsStore _splitsStore,
    JBPaymentTerminalStore _store,
    address _owner
  )
    JBPaymentTerminal(
      address(_token),
      _currency,
      _baseWeightCurrency,
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
    IERC20(token).transferFrom(_from, _to, _amount);
  }

  function _beforeTransferTo(address _to, uint256 _amount) internal override {
    IERC20(token).approve(_to, _amount);
  }
}
