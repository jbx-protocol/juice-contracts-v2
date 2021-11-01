// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBControllerUtility.sol';

/** 
  @notice
  Provides tools for contracts that has functionality that can only be accessed by a project's controller.
*/
abstract contract JBControllerUtility is IJBControllerUtility {
  modifier onlyController(uint256 _projectId) {
    require(address(directory.controllerOf(_projectId)) == msg.sender, '0x4f: UNAUTHORIZED');
    _;
  }

  /** 
    @notice 
    The directory of terminals and controllers for projects.
  */
  IJBDirectory public immutable override directory;

  /** 
    @param _directory A contract storing directories of terminals and controllers for each project.
  */
  constructor(IJBDirectory _directory) {
    directory = _directory;
  }
}
