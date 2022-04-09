// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBFundingCycleStore.sol';
import './../enums/JBBallotState.sol';

interface IJBFundingCycleBallot {
  function delay() external view returns (uint256);

  function fundingCycleStore() external view returns (IJBFundingCycleStore);

  function duration() external view returns (uint256);

  function finalState(uint256 _projectId, uint256 _configuration) external returns (JBBallotState);

  function stateOf(uint256 _projectId, uint256 _configuration)
    external
    view
    returns (JBBallotState);

  function finalize(uint256 _projectId, uint256 _configured) external returns (JBBallotState);
}
