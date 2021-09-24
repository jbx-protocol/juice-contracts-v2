// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBFundingCycleBallot.sol';
import './../structs/FundingCycle.sol';
import './../structs/FundingCycleData.sol';

interface IJBFundingCycleStore {
  event Configure(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    uint256 indexed reconfigured,
    FundingCycleData data,
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

  function get(uint256 _fundingCycleId) external view returns (FundingCycle memory);

  function queuedOf(uint256 _projectId) external view returns (FundingCycle memory);

  function currentOf(uint256 _projectId) external view returns (FundingCycle memory);

  function currentBallotStateOf(uint256 _projectId) external view returns (BallotState);

  function configureFor(
    uint256 _projectId,
    FundingCycleData calldata _data,
    uint256 _metadata,
    uint256 _fee,
    bool _configureActiveFundingCycle
  ) external returns (FundingCycle memory fundingCycle);

  function tapFrom(uint256 _projectId, uint256 _amount)
    external
    returns (FundingCycle memory fundingCycle);
}
