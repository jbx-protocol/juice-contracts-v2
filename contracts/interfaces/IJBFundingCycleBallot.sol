// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../enums/JBBallotState.sol';

interface IJBFundingCycleBallot {
    function duration() external view returns (uint256);

    function stateOf(uint256 _configured) external view returns (JBBallotState);
}
