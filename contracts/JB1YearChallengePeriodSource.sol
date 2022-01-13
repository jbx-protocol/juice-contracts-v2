// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBChallengePeriodSource.sol';

contract JB1YearChallengePeriodSource is IJBChallengePeriodSource {
  /** 
    @notice
    The number of seconds in 365 days.
  */
  uint256 private constant _SECONDS_IN_YEAR = 31536000;

  /** 
    @notice Get the total challenge expiry time when challenging an inactive project handle.

    @dev The projectId param is unused here, but could be used in other implementations of IJBChallengeExpiry 
    (e.g. to help recover specific handles)
  */

  function getChallengePeriod(uint256) external view override returns (uint256) {
    return block.timestamp + _SECONDS_IN_YEAR;
  }
}
