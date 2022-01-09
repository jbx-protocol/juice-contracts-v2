// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';

import './abstract/JBOperatable.sol';
import './interfaces/IJBTerminal.sol';
import './interfaces/IJBDirectory.sol';
import './libraries/JBOperations.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error ADD_TERMINAL_ZERO_ADDRESS();
error CONTROLLER_ALREADY_IN_ALLOWLIST();
error CONTROLLER_NOT_IN_ALLOWLIST();
error INVALID_PROJECT_ID();
error PRIMARY_TERMINAL_ALREADY_SET();
error SET_CONTROLLER_ZERO_ADDRESS();
error SET_PRIMARY_TERMINAL_ZERO_ADDRESS();

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

    _projectId The ID of the project to get terminals of.
  */
  mapping(uint256 => IJBTerminal[]) private _terminalsOf;

  /** 
    @notice 
    The project's primary terminal for a token.

    _projectId The ID of the project to get the primary terminal of.
    _token The token to get the project's primary terminal of.
  */
  mapping(uint256 => mapping(address => IJBTerminal)) private _primaryTerminalOf;

  /**
    @notice
    Addresses that can set a project's controller. These addresses/contracts have been vetted and verified by Juicebox owners.
   */
  mapping(address => bool) private _setControllerAllowlist;

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

    _projectId The ID of the project to get the controller of.
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

    @dev
    The zero address is returned if a terminal isn't found for the specified token.

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

    // Return the first terminal which accepts the specified token.
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++) {
      IJBTerminal _terminal = _terminalsOf[_projectId][_i];
      if (_terminal.token() == _token) return _terminal;
    }

    // Not found.
    return IJBTerminal(address(0));
  }

  /**
    @notice
    Whether or not a specified address is allowed to set controllers.

    @param _address the address to check

    @return A flag indicating whether or not the specified address can change controllers.
  */
  function isAllowedToSetController(address _address) public view override returns (bool) {
    return _setControllerAllowlist[_address];
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

  /**
    @notice
    Update the controller that manages how terminals interact with the ecosystem.
    @dev 
    A controller can be set if:
    - the message sender is the project owner or an operator having the correct authorization.
    - or, an allowedlisted address is setting an allowlisted controller.
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
      (_setControllerAllowlist[address(_controller)] && _setControllerAllowlist[msg.sender])
    )
  {
    // Can't set the zero address.
    if (_controller == IJBController(address(0))) {
      revert SET_CONTROLLER_ZERO_ADDRESS();
    }

    // If the controller is already set, nothing to do.
    if (controllerOf[_projectId] == _controller) return;

    // The project must exist.
    if (projects.count() < _projectId) {
      revert INVALID_PROJECT_ID();
    }

    // Set the new controller.
    controllerOf[_projectId] = _controller;

    emit SetController(_projectId, _controller, msg.sender);
  }

  /** 
    @notice 
    Add terminals to project's list of terminals.

    @dev
    Only a project owner, an operator, or its controller can add terminals.

    @param _projectId The ID of the project having a terminal added.
    @param _terminals The terminals to add.
  */
  function addTerminalsOf(uint256 _projectId, IJBTerminal[] calldata _terminals)
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.ADD_TERMINALS,
      msg.sender == address(controllerOf[_projectId])
    )
  {
    for (uint256 _i = 0; _i < _terminals.length; _i++) {
      _addTerminalIfNeeded(_projectId, _terminals[_i], msg.sender);
    }
  }

  /** 
    @notice 
    Remove a terminal from a project's list of terminals.

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
    if (_primaryTerminalOf[_projectId][_terminal.token()] == _terminal)
      delete _primaryTerminalOf[_projectId][_terminal.token()];

    emit RemoveTerminal(_projectId, _terminal, msg.sender);
  }

  /** 
    @notice
    Project's can set which terminal should be their primary for a particular token.
    This is useful in case a project has several terminals connected for a particular token.

    @dev
    The terminal will be set as the primary for the token that its vault accepts. 

    @param _projectId The ID of the project for which a primary token is being set.
    @param _terminal The terminal to make primary.
  */
  function setPrimaryTerminalOf(uint256 _projectId, IJBTerminal _terminal)
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.SET_PRIMARY_TERMINAL)
  {
    // Can't set the zero address.
    if (_terminal == IJBTerminal(address(0))) {
      revert SET_PRIMARY_TERMINAL_ZERO_ADDRESS();
    }

    // Get a reference to the token that the terminal's vault accepts.
    address _token = _terminal.token();

    // Can't set this terminal as the primary if it already is.
    if (_terminal == _primaryTerminalOf[_projectId][_token]) {
      revert PRIMARY_TERMINAL_ALREADY_SET();
    }

    // Add the terminal to thge project if it hasn't been already.
    _addTerminalIfNeeded(_projectId, _terminal, msg.sender);

    // Store the terminal as the primary for the particular token.
    _primaryTerminalOf[_projectId][_token] = _terminal;

    emit SetPrimaryTerminal(_projectId, _token, _terminal, msg.sender);
  }

  /** 
    @notice
    The owner (Juicebox multisig) can add addresses which are allowed to change
    a project's controller. Those addresses are known and vetted controllers as well as
    contracts designed to launch new projects. This is not a requirement for all controllers.
    However, unknown controllers may require additional transactions to perform certain operations.

    @dev
    If you would like an address/contract allowlisted, please reach out to the Juicebox dev team.

    @param _address the allowed address to be added.
  */
  function addToSetControllerAllowlist(address _address) external override onlyOwner {
    // Check that the address is not already in the allowlist.
    if (_setControllerAllowlist[_address]) {
      revert CONTROLLER_ALREADY_IN_ALLOWLIST();
    }

    // Add the address to the allowlist.
    _setControllerAllowlist[_address] = true;

    emit AddToSetControllerAllowlist(_address, msg.sender);
  }

  /** 
    @notice
    See `addKnownController(...)` for context. Removes an address from the allowlist.

    @param _address The address to be removed.
  */
  function removeFromSetControllerAllowlist(address _address) external override onlyOwner {
    // Check that the address is in the allowlist.
    if (!_setControllerAllowlist[_address]) {
      revert CONTROLLER_NOT_IN_ALLOWLIST();
    }

    // Remove the address from the allowlist.
    delete _setControllerAllowlist[_address];

    emit RemoveFromSetControllerAllowlist(_address, msg.sender);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    Add a terminal to a project's list of terminals if it hasn't been already.

    @dev
    If the terminal is equal to address zero, the transaction will be reverted.

    @param _projectId The ID of the project having a terminal added.
    @param _terminal The terminal to add.
    @param _caller The original caller that added the terminal.
  */
  function _addTerminalIfNeeded(
    uint256 _projectId,
    IJBTerminal _terminal,
    address _caller
  ) private {
    if (_terminal == IJBTerminal(address(0))) {
      revert ADD_TERMINAL_ZERO_ADDRESS();
    }

    // Check that the terminal has not already been added.
    if (isTerminalOf(_projectId, _terminal)) return;

    // Set the new terminal.
    _terminalsOf[_projectId].push(_terminal);

    emit AddTerminal(_projectId, _terminal, _caller);
  }
}
