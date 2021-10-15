// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';

import './interfaces/IJBTerminal.sol';
import './interfaces/IJBDirectory.sol';
import './abstract/JBOperatable.sol';
import './libraries/JBOperations.sol';

/**
  @notice
  Keeps a reference of which terminal contracts each project is currently accepting funds through, and which controller contract is managing each project's tokens and funding cycles.
*/
contract JBDirectory is IJBDirectory, JBOperatable, Ownable {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /** 
    @notice 
    For each project ID, the juicebox terminals that are currently managing its funds.

    [_projectId]
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

    [_projectId]
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
  function isTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    public
    view
    override
    returns (bool)
  {
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++)
      if (_terminalsOf[_projectId][_i] == _terminal) return true;
    return false;
  }

  /** 
    @notice
    Whether or not a specified terminal is a terminal of the specified project.

    @param _projectId The ID of the project to check within.
    @param _contract The address of the terminal to check for.

    @return A flag indicating whether or not the specified terminal is a terminal of the specified project.
  */
  function isTerminalDelegateOf(uint256 _projectId, address _contract)
    public
    view
    override
    returns (bool)
  {
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++)
      if (address(_terminalsOf[_projectId][_i].delegate()) == _contract) return true;
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
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++) {
      IJBTerminal _terminal = _terminalsOf[_projectId][_i];
      if (_terminal.vault().token() == _token) return _terminal;
    }

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

  // Either:
  // - case 1: the controller hasn't been set yet and the message sender is the controller being set.
  // - case 2: the current controller is setting a new controller.
  // - case 3: the project owner or an operator is changing the controller.
  /**
    @notice
    Update the controller that manages how terminals interact with tokens and funding cycles.

    @param _projectId The ID of the project to set a new controller for.
    @param _controller The new controller to set.
  */
  function setControllerOf(uint256 _projectId, IJBController _controller)
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.SET_CONTROLLER,
      (address(controllerOf[_projectId]) == address(0) && msg.sender == address(_controller)) ||
        address(controllerOf[_projectId]) == msg.sender
    )
  {
    // Get a reference to the current controller being used.
    IJBController _currentController = controllerOf[_projectId];

    // If the controller is already set, nothing to do.
    if (_currentController == _controller) return;

    // The project must exist.
    require(projects.count() >= _projectId, 'NOT_FOUND');

    // Can't set the zero address.
    require(_controller != IJBController(address(0)), 'ZERO_ADDRESS');

    // Set the new controller.
    controllerOf[_projectId] = _controller;

    emit SetController(_projectId, _controller, msg.sender);
  }

  function addTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.ADD_TERMINAL,
      msg.sender == address(controllerOf[_projectId])
    )
  {
    // Can't set the zero address.
    require(_terminal != IJBTerminal(address(0)), 'ZERO_ADDRESS');

    // If the terminal is already set, nothing to do.
    if (isTerminalOf(_projectId, _terminal)) return;

    // Set the new terminal.
    _terminalsOf[_projectId].push(_terminal);

    emit AddTerminal(_projectId, _terminal, msg.sender);
  }

  function removeTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.REMOVE_TERMINAL,
      msg.sender == address(controllerOf[_projectId])
    )
  {
    IJBTerminal[] memory _terminals = _terminalsOf[_projectId];

    delete _terminalsOf[_projectId];

    for (uint256 _i; _i < _terminals.length; _i++)
      if (_terminals[_i] != _terminal) _terminalsOf[_projectId].push(_terminals[_i]);

    emit RemoveTerminal(_projectId, _terminal, msg.sender);
  }
}
