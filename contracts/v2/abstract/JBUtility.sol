// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBUtility.sol';

abstract contract JBUtility is IJBUtility {
  modifier onlyController(uint256 _projectId) {
    require(address(directory.controllerOf(_projectId)) == msg.sender, 'UNAUTHORIZED');
    _;
  }

  /// @notice The direct deposit terminals.
  IJBDirectory public immutable override directory;

  /** 
    @param _directory A directory of a project's current Juicebox terminal to receive payments in.
  */
  constructor(IJBDirectory _directory) {
    directory = _directory;
  }
}
