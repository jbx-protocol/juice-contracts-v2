// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBFundingCycleBallot.sol';
import './../structs/JBFundingCycle.sol';
import './../structs/JBFundingCycleData.sol';

interface IJBFundingCycleStore {
  event Configure(
    uint256 indexed projectId,
    uint256 indexed configured,
    JBFundingCycleData data,
    uint256 metadata,
    address caller
  );

  event Init(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed projectId,
    uint256 indexed basedOn
  );

  function latestConfigurationOf(uint256 _projectId) external view returns (uint256);

  function get(
    uint256 _projectId,
    uint256 _configuration,
    uint256 _number
  ) external view returns (JBFundingCycle memory);

  function queuedOf(uint256 _projectId) external view returns (JBFundingCycle memory);

  function currentOf(uint256 _projectId) external view returns (JBFundingCycle memory);

  function currentBallotStateOf(uint256 _projectId) external view returns (JBBallotState);

  function configureFor(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    uint256 _metadata
  ) external returns (JBFundingCycle memory fundingCycle);
}
