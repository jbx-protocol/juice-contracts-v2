// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';

import './abstract/JBOperatable.sol';
import './interfaces/IJBPaymentTerminal.sol';
import './interfaces/IJBDirectory.sol';
import './libraries/JBOperations.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_PROJECT_ID_IN_DIRECTORY();

/**
  @notice
  Keeps a reference of which terminal contracts each project is currently accepting funds through, and which controller contract is managing each project's tokens and funding cycles.

  @dev
  Adheres to:
  IJBDirectory: General interface for the methods in this contract that interact with the blockchain's state according to the Juicebox protocol's rules.

  @dev
  Inherits from:
  JBOperatable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
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
  mapping(uint256 => IJBPaymentTerminal[]) private _terminalsOf;

  /** 
    @notice 
    The project's primary terminal for a token.

    _projectId The ID of the project to get the primary terminal of.
    _token The token to get the project's primary terminal of.
  */
  mapping(uint256 => mapping(address => IJBPaymentTerminal)) private _primaryTerminalOf;

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

  /**
    @notice
    Addresses that can set a project's first controller on their behalf. These addresses/contracts have been vetted and verified by this contract's owner.

    _address The address that is either allowed or not.
  */
  mapping(address => bool) public override isAllowedToSetFirstController;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /** 
    @notice
    For each project ID, the terminals that are currently managing its funds.

    @param _projectId The ID of the project to get terminals of.

    @return An array of terminal addresses.
  */
  function terminalsOf(uint256 _projectId)
    external
    view
    override
    returns (IJBPaymentTerminal[] memory)
  {
    return _terminalsOf[_projectId];
  }

  /** 
    @notice
    Whether or not a specified terminal is a terminal of the specified project.

    @param _projectId The ID of the project to check within.
    @param _terminal The address of the terminal to check for.

    @return A flag indicating whether or not the specified terminal is a terminal of the specified project.
  */
  function isTerminalOf(uint256 _projectId, IJBPaymentTerminal _terminal)
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
    returns (IJBPaymentTerminal)
  {
    // If a primary terminal for the token was specifically set, return it.
    if (_primaryTerminalOf[_projectId][_token] != IJBPaymentTerminal(address(0)))
      return _primaryTerminalOf[_projectId][_token];

    // Return the first terminal which accepts the specified token.
    for (uint256 _i; _i < _terminalsOf[_projectId].length; _i++) {
      IJBPaymentTerminal _terminal = _terminalsOf[_projectId][_i];
      if (_terminal.token() == _token) return _terminal;
    }

    // Not found.
    return IJBPaymentTerminal(address(0));
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
    - or, an allowedlisted address is setting a controller for a project that doesn't already have a controller.

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
      (isAllowedToSetFirstController[msg.sender] &&
        controllerOf[_projectId] == IJBController(address(0)))
    )
  {
    // The project must exist.
    if (projects.count() < _projectId) revert INVALID_PROJECT_ID_IN_DIRECTORY();

    // Set the new controller.
    controllerOf[_projectId] = _controller;

    emit SetController(_projectId, _controller, msg.sender);
  }

  /** 
    @notice 
    Set a project's terminals.

    @dev
    Only a project owner, an operator, or its controller can set its terminals.

    @param _projectId The ID of the project having terminals set.
    @param _terminals The terminal to set.
  */
  function setTerminalsOf(uint256 _projectId, IJBPaymentTerminal[] calldata _terminals)
    external
    override
    requirePermissionAllowingOverride(
      projects.ownerOf(_projectId),
      _projectId,
      JBOperations.SET_TERMINALS,
      msg.sender == address(controllerOf[_projectId])
    )
  {
    // Get a reference to the terminals of the project.
    IJBPaymentTerminal[] memory _oldTerminals = _terminalsOf[_projectId];

    // Delete the stored terminals for the project.
    _terminalsOf[_projectId] = _terminals;

    // If one of the old terminals was set as a primary terminal but is not included in the new terminals, remove it from being a primary terminal.
    for (uint256 _i; _i < _oldTerminals.length; _i++)
      if (
        _primaryTerminalOf[_projectId][_oldTerminals[_i].token()] == _oldTerminals[_i] &&
        !_contains(_terminals, _oldTerminals[_i])
      ) delete _primaryTerminalOf[_projectId][_oldTerminals[_i].token()];

    emit SetTerminals(_projectId, _terminals, msg.sender);
  }

  /** 
    @notice
    Project's can set which terminal should be their primary for a particular token.
    This is useful in case a project has several terminals connected for a particular token.

    @dev
    The terminal will be set as the primary terminal where ecosystem contracts should route tokens.

    @param _projectId The ID of the project for which a primary token is being set.
    @param _terminal The terminal to make primary.
  */
  function setPrimaryTerminalOf(uint256 _projectId, IJBPaymentTerminal _terminal)
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.SET_PRIMARY_TERMINAL)
  {
    // Get a reference to the token that the terminal accepts.
    address _token = _terminal.token();

    // Add the terminal to the project if it hasn't been already.
    _addTerminalIfNeeded(_projectId, _terminal);

    // Store the terminal as the primary for the particular token.
    _primaryTerminalOf[_projectId][_token] = _terminal;

    emit SetPrimaryTerminal(_projectId, _token, _terminal, msg.sender);
  }

  /** 
    @notice	
    Set a contract to the list of trusted addresses that can set a first controller for any project.	

    @dev
    The owner can add addresses which are allowed to change projects' first controllers. 
    These addresses are known and vetted controllers as well as contracts designed to launch new projects. 
    A project can set its own controller without it being on the allow list.

    @dev
    If you would like an address/contract allowlisted, please reach out to the contract owner.

    @param _address The address to allow or revoke allowance from.
    @param _flag Whether allowance is being added or revoked.
  */
  function setIsAllowedToSetFirstController(address _address, bool _flag)
    external
    override
    onlyOwner
  {
    // Set the flag in the allowlist.
    isAllowedToSetFirstController[_address] = _flag;

    emit SetIsAllowedToSetFirstController(_address, _flag, msg.sender);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    Add a terminal to a project's list of terminals if it hasn't been already.

    @param _projectId The ID of the project having a terminal added.
    @param _terminal The terminal to add.
  */
  function _addTerminalIfNeeded(uint256 _projectId, IJBPaymentTerminal _terminal) private {
    // Check that the terminal has not already been added.
    if (isTerminalOf(_projectId, _terminal)) return;

    // Add the new terminal.
    _terminalsOf[_projectId].push(_terminal);

    emit AddTerminal(_projectId, _terminal, msg.sender);
  }

  /** 
    @notice
    Check if the provided terminal array contains the provided terminal.

    @param _terminals The terminals to look through.
    @param _terminal The terminal to check for.

    @return Whether or not the `_terminals` includes the `_terminal`.
  */
  function _contains(IJBPaymentTerminal[] calldata _terminals, IJBPaymentTerminal _terminal)
    private
    pure
    returns (bool)
  {
    for (uint256 _i; _i < _terminals.length; _i++) if (_terminals[_i] == _terminal) return true;
    return false;
  }
}
