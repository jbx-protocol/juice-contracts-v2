// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBTerminalUtility.sol';

abstract contract JBTerminalUtility is IJBTerminalUtility {
  modifier onlyTerminal(uint256 _projectId) {
    require(directory.isTerminalOf(_projectId, msg.sender), 'TerminalUtility: UNAUTHORIZED');
    _;
  }

  // modifier onlyTerminalOrBootloader(uint256 _projectId) {
  //     require(
  //         msg.sender == address(directory.terminalOf(_projectId)) ||
  //             msg.sender == bootloader,
  //         "TerminalUtility: UNAUTHORIZED"
  //     );
  //     _;
  // }

  /// @notice The direct deposit terminals.
  IJBDirectory public immutable override directory;

  /// @notice The direct deposit terminals.
  // address public immutable override bootloader;

  /** 
      @param _directory A directory of a project's current Juicebox terminal to receive payments in.
    */
  constructor(IJBDirectory _directory) {
    directory = _directory;
    // bootloader = _bootloader;
  }
}
