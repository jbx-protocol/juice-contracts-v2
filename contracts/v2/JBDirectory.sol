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
    For each project ID, the terminals that are currently managing its funds.

    [_projectId]
  */
  mapping(uint256 => IJBTerminal[]) private _terminalsOf;

  /** 
    @notice 
    The project's primary terminal for a token.

    [_projectId][_token]
  */
  mapping(uint256 => mapping(address => IJBTerminal)) private _primaryTerminalOf;

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
    For each project ID, the terminals that are currently managing its funds.

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
    The primary terminal that is managing funds for a project for a specified token.

    @param _projectId The ID of the project to get a terminal for.
    @param _token The token the terminal accepts.

    @return The primary terminal for the project for the specified token.
  */
  function primaryTerminalOf(uint256 _projectId, address _token)
    public
    view
    override
    returns (IJBTerminal)
  {
    // If a primary terminal for the token was specifically set, return it.
    if (_primaryTerminalOf[_projectId][_token] != IJBTerminal(address(0)))
      return _primaryTerminalOf[_projectId][_token];

    // return the first terminal which accepts the specified token.
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++) {
      IJBTerminal _terminal = _terminalsOf[_projectId][_i];
      if (_terminal.vault().token() == _token) return _terminal;
    }

    // Not found.
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

    @dev 
    A controller cant be set if:
    - case 1: the project owner or an operator is changing the controller.
    - case 2: the controller hasn't been set yet and the message sender is the controller being set.
    - case 3: the current controller is setting a new controller.

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
    require(projects.count() >= _projectId, '0x2b: NOT_FOUND');

    // Can't set the zero address.
    require(_controller != IJBController(address(0)), '0x2c: ZERO_ADDRESS');

    // Set the new controller.
    controllerOf[_projectId] = _controller;

    emit SetController(_projectId, _controller, msg.sender);
  }

  /** 
    @notice 
    Add a terminal to project's list of terminals.

    @dev
    Only a project owner, an operator, or its controller can add a terminal 

    @param _projectId The ID of the project having a terminal added.
    @param _terminal The terminal to add.
  */
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
    require(_terminal != IJBTerminal(address(0)), '0x2d: ZERO_ADDRESS');

    // If the terminal is already set, nothing to do.
    if (isTerminalOf(_projectId, _terminal)) return;

    // Set the new terminal.
    _terminalsOf[_projectId].push(_terminal);

    emit AddTerminal(_projectId, _terminal, msg.sender);
  }

  /** 
    @notice 
    Removed a terminal from a project's list of terminals.

    @dev
    Only a project owner or an operator can remove one of its terminals. 

    @param _projectId The ID of the project having a terminal removed.
    @param _terminal The terminal to remove.
  */
  function removeTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.REMOVE_TERMINAL)
  {
    // Get a reference to the terminals of the project.
    IJBTerminal[] memory _terminals = _terminalsOf[_projectId];

    // Delete the stored terminals for the project.
    delete _terminalsOf[_projectId];

    // Repopulate the stored terminals for the project, omitting the one being deleted.
    for (uint256 _i; _i < _terminals.length; _i++)
      // Don't include the terminal being deleted.
      if (_terminals[_i] != _terminal) _terminalsOf[_projectId].push(_terminals[_i]);

    // If the terminal that is being removed is the primary terminal for the token, delete it from being primary terminal.
    if (_primaryTerminalOf[_projectId][_terminal.vault().token()] == _terminal)
      delete _primaryTerminalOf[_projectId][_terminal.vault().token()];

    emit RemoveTerminal(_projectId, _terminal, msg.sender);
  }

  /** 
    @notice
    Project's can set which terminal should be their primary for a particular token.
    This is useful in case a project has several terminals connected for a particular token.

    @dev
    The terminal will be set as the primary for the token that it's vault accepts. 

    @param _projectId The ID of the project for which a primary token is being set.
    @param _terminal The terminal to make primary.
  */
  function setPrimaryTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.SET_PRIMARY_TERMINAL)
  {
    // Can't set the zero address.
    require(_terminal != IJBTerminal(address(0)), '0x2e: ZERO_ADDRESS');

    // Get a reference to the token that the terminal's vault accepts.
    address _token = _terminal.vault().token();

    // Store the terminal as the primary for the particular token.
    _primaryTerminalOf[_projectId][_token] = _terminal;

    emit SetPrimaryTerminal(_projectId, _token, _terminal, msg.sender);
  }
}
