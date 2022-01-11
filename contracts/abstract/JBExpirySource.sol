// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../interfaces/IJBExpirySource.sol';

abstract contract JBExpirySource is IJBExpirySource {
  /** 
    @notice
    The number of seconds in 365 days.
  */
  uint256 private constant _SECONDS_IN_YEAR = 31536000;

  /** 
    @notice Get the total challenge expiry time when challenging an inactive project handle.
    
    @dev The owner of the contract makes admin decisions such as:
      - Which address is the funding cycle owner, which can withdraw funds from the funding cycle.
      - Should this project's Tickets be migrated to a new TerminalV1. 

    @dev The projectId param is unused here, but could be used in other implementations of IJBChallengeExpiry 
    (e.g. to help recover specific handles)
  */

  function getExpiryFor(uint256) external view override returns (uint256 challengeExpiry) {
    return block.timestamp + _SECONDS_IN_YEAR;
  }
}
