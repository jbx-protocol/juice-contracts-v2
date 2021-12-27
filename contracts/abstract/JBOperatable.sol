// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBOperatable.sol';
import './../libraries/JBErrors.sol';

/** 
  @notice
  Modifiers to allow access to functions based on the message sender's operator status.
*/
abstract contract JBOperatable is IJBOperatable {
  modifier requirePermission(
    address _account,
    uint256 _domain,
    uint256 _permissionIndex
  ) {
    if (
      msg.sender != _account &&
        !operatorStore.hasPermission(msg.sender, _account, _domain, _permissionIndex) &&
        !operatorStore.hasPermission(msg.sender, _account, 0, _permissionIndex)
    ) {
      revert JBErrors.UNAUTHORIZED();
    }
    _;
  }

  modifier requirePermissionAllowingOverride(
    address _account,
    uint256 _domain,
    uint256 _permissionIndex,
    bool _override
  ) {
    if (
      !_override &&
        msg.sender != _account &&
        !operatorStore.hasPermission(msg.sender, _account, _domain, _permissionIndex) &&
        !operatorStore.hasPermission(msg.sender, _account, 0, _permissionIndex)
    ) {
      revert JBErrors.UNAUTHORIZED();
    }
    _;
  }

  /** 
    @notice 
    A contract storing operator assignments.
  */
  IJBOperatorStore public immutable override operatorStore;

  /** 
    @param _operatorStore A contract storing operator assignments.
  */
  constructor(IJBOperatorStore _operatorStore) {
    operatorStore = _operatorStore;
  }
}
