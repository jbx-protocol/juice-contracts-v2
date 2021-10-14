// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBTerminal.sol';
import './interfaces/IJBDirectory.sol';
import './abstract/JBOperatable.sol';
import './libraries/JBOperations.sol';

/**
  @notice
  Allows project owners to deploy proxy contracts that can pay them when receiving funds directly.
*/
contract JBDirectory is IJBDirectory, JBOperatable {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /** 
    @notice 
    For each project ID, the juicebox terminals that are currently managing its funds.
  */
  mapping(uint256 => IJBTerminal[]) private _terminalsOf;

  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//

  /** 
    @notice 
    The Projects contract which mints ERC-721's that represent project ownership and transfers.
  */
  IJBProjects public immutable override projects;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    For each project ID, the controller that manages how terminals interact with tokens and funding cycles.
  */
  mapping(uint256 => IJBController) public override controllerOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /** 
    @notice
    For each project ID, the juicebox terminals that are currently managing its funds.

    @param _projectId The ID of the project to get terminals of.

    @return An array of terminal addresses.
  */
  function terminalsOf(uint256 _projectId) external view override returns (IJBTerminal[] memory) {
    return _terminalsOf[_projectId];
  }

  /** 
    @notice
    Whether or not a specified terminal is a terminal of the specified project.

    @param _projectId The ID of the project to check within.
    @param _terminal The address of the terminal to check for.

    @return A flag indicating whether or not the specified terminal is a terminal of the specified project.
  */
  function isTerminalOf(uint256 _projectId, address _terminal) public view override returns (bool) {
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++)
      if (address(_terminalsOf[_projectId][_i]) == _terminal) return true;
    return false;
  }

  /** 
    @notice
    The terminal that is managing funds for a project within the specified domain.

    @param _projectId The ID of the project to get a terminal for.
    @param _token The token the terminal accepts.

    @return The terminal for the project within the specified domain.
  */
  function terminalOf(uint256 _projectId, address _token)
    public
    view
    override
    returns (IJBTerminal)
  {
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++)
      if (_terminalsOf[_projectId][_i].vault().token() == _token)
        return _terminalsOf[_projectId][_i];

    return IJBTerminal(address(0));
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _operatorStore A contract storing operator assignments.
    @param _projects A contract which mints ERC-721's that represent project ownership and transfers.
  */
  constructor(IJBOperatorStore _operatorStore, IJBProjects _projects) JBOperatable(_operatorStore) {
    projects = _projects;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Update the controller that manages how terminals interact with tokens and funding cycles.

    @param _projectId The ID of the project to set a new controller for.
    @param _controller The new controller to set.
  */
  function setControllerOf(uint256 _projectId, IJBController _controller) external override {
    // Get a reference to the current controller being used.
    IJBController _currentController = controllerOf[_projectId];

    // If the controller is already set, nothing to do.
    if (_currentController == _controller) return;

    // Get a reference to the project owner.
    address _projectOwner = projects.ownerOf(_projectId);

    // The project must exist.
    require(projects.count() >= _projectId, 'NOT_FOUND');

    // Can't set the zero address.
    require(_controller != IJBController(address(0)), 'ZERO_ADDRESS');

    // Either:
    // - case 1: the controller hasn't been set yet and the msg sender is the controller being set.
    // - case 2: the current controller is setting a new controller.
    // - case 3: the project owner or an operator is changing the controller.
    require(
      // case 1.
      (address(controllerOf[_projectId]) == address(0) && msg.sender == address(_controller)) ||
        // case 2.
        address(controllerOf[_projectId]) == msg.sender ||
        // case 3.
        (msg.sender == _projectOwner ||
          operatorStore.hasPermission(
            msg.sender,
            _projectOwner,
            _projectId,
            JBOperations.SET_CONTROLLER
          )),
      'UNAUTHORIZED'
    );

    // Set the new controller.
    controllerOf[_projectId] = _controller;

    emit SetController(_projectId, _controller, msg.sender);
  }

  function addTerminalOf(uint256 _projectId, IJBTerminal _terminal) external override {
    // Get a reference to the project owner.
    address _projectOwner = projects.ownerOf(_projectId);

    // Only the controller of the project can add a terminal.
    require(
      msg.sender == address(controllerOf[_projectId]) ||
        (msg.sender == _projectOwner ||
          operatorStore.hasPermission(
            msg.sender,
            _projectOwner,
            _projectId,
            JBOperations.ADD_TERMINAL
          )),
      'UNAUTHORIZED'
    );

    // Can't set the zero address.
    require(_terminal != IJBTerminal(address(0)), 'ZERO_ADDRESS');

    // If the terminal is already set, nothing to do.
    if (isTerminalOf(_projectId, address(_terminal))) return;

    // Set the new terminal.
    _terminalsOf[_projectId].push(_terminal);

    emit AddTerminal(_projectId, _terminal, msg.sender);
  }

  function removeTerminalOf(uint256 _projectId, IJBTerminal _terminal) external override {
    // Get a reference to the project owner.
    address _projectOwner = projects.ownerOf(_projectId);

    // Only the controller of the project can add a terminal.
    require(
      msg.sender == address(controllerOf[_projectId]) ||
        (msg.sender == _projectOwner ||
          operatorStore.hasPermission(
            msg.sender,
            _projectOwner,
            _projectId,
            JBOperations.REMOVE_TERMINAL
          )),
      'UNAUTHORIZED'
    );
    IJBTerminal[] memory _terminals = _terminalsOf[_projectId];

    delete _terminalsOf[_projectId];

    for (uint256 _i; _i < _terminals.length; _i++)
      if (_terminals[_i] != _terminal) _terminalsOf[_projectId].push(_terminals[_i]);

    emit RemoveTerminal(_projectId, _terminal, msg.sender);
  }
}
