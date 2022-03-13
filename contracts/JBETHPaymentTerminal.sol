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
  /**
    @notice
    Gets the current overflowed amount in this for a specified project, in terms of ETH.

    @dev
    The current overflow is represented as a fixed point number with 18 decimals.

    @param _projectId The ID of the project to get overflow for.

    @return The current amount of ETH overflow that project has in this terminal, as a fixed point number with 18 decimals.
  */
  function currentEthOverflowOf(uint256 _projectId) external view override returns (uint256) {
    return store.currentOverflowOf(this, _projectId);
  }

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
