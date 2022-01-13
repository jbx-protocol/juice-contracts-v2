// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBChallengePeriodSource.sol';

contract JB1YearChallengePeriodSource is IJBChallengePeriodSource {
  /** 
    @notice Get the total challenge expiry time when challenging an inactive project handle.

    @dev The projectId param is unused here, but could be used in other implementations of IJBChallengeExpiry 
    (e.g. to help recover specific handles)
  */

  function getChallengePeriod(uint256) external view override returns (uint256) {
    return block.timestamp + 31536000; // Number of seconds in 365 days
  }
}
