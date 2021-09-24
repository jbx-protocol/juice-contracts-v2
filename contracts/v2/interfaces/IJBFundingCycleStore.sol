// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBFundingCycleBallot.sol';
import './../structs/JBFundingCycle.sol';
import './../structs/JBFundingCycleData.sol';

interface IJBFundingCycleStore {
  event Configure(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    uint256 indexed reconfigured,
    JBFundingCycleData data,
    uint256 metadata,
    address caller
  );

  event Tap(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    uint256 amount,
    uint256 newTappedAmount,
    address caller
  );

  event Init(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    uint256 indexed number,
    uint256 basedOn,
    uint256 weight,
    uint256 start
  );

  function latestIdOf(uint256 _projectId) external view returns (uint256);

  function MAX_CYCLE_LIMIT() external view returns (uint256);

  function get(uint256 _fundingCycleId) external view returns (JBFundingCycle memory);

  function queuedOf(uint256 _projectId) external view returns (JBFundingCycle memory);

  function currentOf(uint256 _projectId) external view returns (JBFundingCycle memory);

  function currentBallotStateOf(uint256 _projectId) external view returns (BallotState);

  function configureFor(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    uint256 _metadata,
    uint256 _fee,
    bool _configureActiveFundingCycle
  ) external returns (JBFundingCycle memory fundingCycle);

  function tapFrom(uint256 _projectId, uint256 _amount)
    external
    returns (JBFundingCycle memory fundingCycle);
}
