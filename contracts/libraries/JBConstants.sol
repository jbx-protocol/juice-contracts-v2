// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/**
@notice
Global constants used across multiple Juicebox contracts.
*/
library JBConstants {
  /** 
    @notice
    Maximum value for token reserved, redemption, ballot redemption rate.
  */
  uint256 public constant MAX_TOKEN_RATE = 10000;
}