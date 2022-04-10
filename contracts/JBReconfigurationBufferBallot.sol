// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBFundingCycleStore.sol';

/** 
  @notice Manages approving funding cycle reconfigurations automatically after a buffer period.
*/
contract JBReconfigurationBufferBallot is IJBFundingCycleBallot {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /**
    @notice 
    The finalized state.

    @dev
    If `Active`, the ballot for the provided configuration can still be finalized whenever its state settles.
  */
  mapping(uint256 => mapping(uint256 => JBBallotState)) private _finalState;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /**
    @notice 
    The number of seconds that must pass for a funding cycle reconfiguration to become active.
  */
  uint256 public immutable override delay;

  /**
    @notice
    The contract storing all funding cycle configurations.
  */
  IJBFundingCycleStore public immutable override fundingCycleStore;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The time that this ballot is active for.

    @dev A ballot should not be considered final until the duration has passed.

    @return The duration in seconds.
  */
  function duration() external view override returns (uint256) {
    return delay;
  }

  /** 
    @notice 
    The finalized state.

    @dev
    If `Active`, the ballot for the provided configuration can still be finalized whenever its state settles.

    @return The duration in seconds.
  */
  function finalState(uint256 _projectId, uint256 _configuration)
    external
    view
    override
    returns (JBBallotState)
  {
    return _finalState[_projectId][_configuration];
  }

  /**
    @notice 
    The approval state of a particular funding cycle.

    @param _projectId The ID of the project to which the funding cycle being checked belongs.
    @param _configured The configuration of the funding cycle to check the state of.
    @param _start The start timestamp of the funding cycle to check the state of.

    @return The state of the provided ballot.
  */
  function stateOf(
    uint256 _projectId,
    uint256 _configured,
    uint256 _start
  ) public view override returns (JBBallotState) {
    // If there is a finalized state, return it.
    if (_finalState[_projectId][_configured] != JBBallotState.Active)
      return _finalState[_projectId][_configured];

    // If the delay hasn't yet passed, the ballot is either failed or active.
    if (block.timestamp < _configured + delay)
      // If the current timestamp is passed the start, the ballot is failed
      return (block.timestamp >= _start) ? JBBallotState.Failed : JBBallotState.Active;

    // The ballot is otherwise approved.
    return JBBallotState.Approved;
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /**
    @param _delay The delay to wait until a reconfiguration is considered approved.
    @param _fundingCycleStore A contract storing all funding cycle configurations.
  */
  constructor(uint256 _delay, IJBFundingCycleStore _fundingCycleStore) {
    delay = _delay;
    fundingCycleStore = _fundingCycleStore;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice 
    Finalizes a configuration state if the funding cycle has started and the current state has settled.

    @param _projectId The ID of the project to which the funding cycle being checked belongs.
    @param _configured The configuration of the funding cycle to check the state of.

    @return ballotState The state of the finalized ballot. If `Active`, the ballot can still later be finalized when it's state resolves.
  */
  function finalize(uint256 _projectId, uint256 _configured)
    external
    override
    returns (JBBallotState ballotState)
  {
    // Get the funding cycle for the configuration in question.
    JBFundingCycle memory _fundingCycle = fundingCycleStore.get(_projectId, _configured);

    // Get the current ballot state.
    ballotState = _finalState[_projectId][_configured];

    // If the final ballot state is still `Active`, save the ballot state if it has finalized.
    if (block.timestamp >= _fundingCycle.start && ballotState == JBBallotState.Active) {
      ballotState = stateOf(_projectId, _configured, _fundingCycle.start);
      // If the ballot is active after the cycle has started, it should be finalized as failed.
      if (ballotState != JBBallotState.Active) _finalState[_projectId][_configured] = ballotState;
    }
  }
}
