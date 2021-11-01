// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './libraries/JBOperations.sol';

// Inheritance
import './interfaces/IJBSplitsStore.sol';
import './interfaces/IJBDirectory.sol';
import './abstract/JBOperatable.sol';

/**
  @notice
  Stores splits for each project.
*/
contract JBSplitsStore is IJBSplitsStore, JBOperatable {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /** 
    @notice
    All splits for each project ID's configurations.

    _projectId is The ID of the project to get splits for.
    _domain is An identifier within which the returned splits should be considered active.
    _group The identifying group of the splits.
  */
  mapping(uint256 => mapping(uint256 => mapping(uint256 => JBSplit[]))) private _splitsOf;

  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//

  /** 
    @notice 
    The Projects contract which mints ERC-721's that represent project ownership and transfers.
  */
  IJBProjects public immutable override projects;

  /** 
    @notice 
    The directory of terminals and controllers for projects.
  */
  IJBDirectory public immutable override directory;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice 
    Get all splits for the specified project ID, within the specified domain, for the specified group.

    @param _projectId The ID of the project to get splits for.
    @param _domain An identifier within which the returned splits should be considered active.
    @param _group The identifying group of the splits.

    @return An array of all splits for the project.
    */
  function splitsOf(
    uint256 _projectId,
    uint256 _domain,
    uint256 _group
  ) external view override returns (JBSplit[] memory) {
    return _splitsOf[_projectId][_domain][_group];
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _operatorStore A contract storing operator assignments.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
    @param _directory A contract storing directories of terminals and controllers for each project.
  */
  constructor(
    IJBOperatorStore _operatorStore,
    IJBProjects _projects,
    IJBDirectory _directory
  ) JBOperatable(_operatorStore) {
    projects = _projects;
    directory = _directory;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /** 
    @notice 
    Sets a project's splits.

    @dev
    Only the owner or operator of a project, or the current controller contract of the project, can set its splits.

    @dev
    The new splits must include any currently set splits that are locked.

    @param _projectId The ID of the project for which splits are being added.
    @param _domain An identifier within which the splits should be considered active.
    @param _group An identifier between of splits being set. All splits within this _group must add up to within 100%.
    @param _splits The splits to set.
  */
  function set(
    uint256 _projectId,
    uint256 _domain,
    uint256 _group,
    JBSplit[] memory _splits
  )
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.SET_SPLITS,
      address(directory.controllerOf(_projectId)) == msg.sender
    )
  {
    // Get a reference to the project's current splits.
    JBSplit[] memory _currentSplits = _splitsOf[_projectId][_domain][_group];

    // Check to see if all locked splits are included.
    for (uint256 _i = 0; _i < _currentSplits.length; _i++) {
      // If not locked, continue.
      if (block.timestamp >= _currentSplits[_i].lockedUntil) continue;

      // Keep a reference to whether or not the locked split being iterated on is included.
      bool _includesLocked = false;

      for (uint256 _j = 0; _j < _splits.length; _j++) {
        // Check for sameness.
        if (
          _splits[_j].percent == _currentSplits[_i].percent &&
          _splits[_j].beneficiary == _currentSplits[_i].beneficiary &&
          _splits[_j].allocator == _currentSplits[_i].allocator &&
          _splits[_j].projectId == _currentSplits[_i].projectId &&
          // Allow lock extention.
          _splits[_j].lockedUntil >= _currentSplits[_i].lockedUntil
        ) _includesLocked = true;
      }
      require(_includesLocked, '0x0f: SOME_LOCKED');
    }

    // Delete from storage so splits can be repopulated.
    delete _splitsOf[_projectId][_domain][_group];

    // Add up all the percents to make sure they cumulative are under 100%.
    uint256 _percentTotal = 0;

    for (uint256 _i = 0; _i < _splits.length; _i++) {
      // The percent should be greater than 0.
      require(_splits[_i].percent > 0, '0x10: BAD_SPLIT_PERCENT');

      // The allocator and the beneficiary shouldn't both be the zero address.
      require(
        _splits[_i].allocator != IJBSplitAllocator(address(0)) ||
          _splits[_i].beneficiary != address(0),
        '0x11: ZERO_ADDRESS'
      );

      // Add to the total percents.
      _percentTotal = _percentTotal + _splits[_i].percent;

      // The total percent should be less than 10000000.
      require(_percentTotal <= 10000000, '0x12: BAD_TOTAL_PERCENT');

      // Push the new split into the project's list of splits.
      _splitsOf[_projectId][_domain][_group].push(_splits[_i]);

      emit SetSplit(_projectId, _domain, _group, _splits[_i], msg.sender);
    }
  }
}
