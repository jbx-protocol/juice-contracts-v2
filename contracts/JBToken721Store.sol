// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './abstract/JBControllerUtility.sol';
import './abstract/JBOperatable.sol';
import './interfaces/IJBToken721Store.sol';
import './interfaces/IJBToken721.sol';
import './interfaces/IJBToken721UriResolver.sol';
import './libraries/JBOperations.sol';
import './JBToken721.sol';

/**
  @notice
  Manage token minting, burning, and account balances.

  @dev
  Token balances can be either represented internally or claimed as ERC-20s into wallets.
  This contract manages these two representations and allows claiming.

  @dev
  The total supply of a project's tokens and the balance of each account are calculated in this contract.

  @dev
  Each project can bring their own token if they prefer, and swap between tokens at any time.

  @dev
  Adheres to -
  IJBToken721Store: General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.

  @dev
  Inherits from -
  JBControllerUtility: Includes convenience functionality for checking if the message sender is the current controller of the project whose data is being manipulated.
  JBOperatable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
*/
contract JBToken721Store is IJBToken721Store, JBControllerUtility, JBOperatable {
  //*********************************************************************//
  // --------------------------- custom errors ------------------------- //
  //*********************************************************************//
  error EMPTY_NAME();
  error EMPTY_SYMBOL();
  error EMPTY_BASE_URI();
  error INSUFFICIENT_FUNDS();
  error INSUFFICIENT_UNCLAIMED_TOKENS();
  error PROJECT_ALREADY_HAS_TOKEN();
  error RECIPIENT_ZERO_ADDRESS();
  error TOKEN_ALREADY_IN_USE();
  error TOKEN_NOT_FOUND();
  error INVALID_BURN_REQUEST();
  error INCORRECT_OWNER();
  error INVALID_ADDRESS();
  error ALREADY_REGISTRED();
  error NOT_REGISTRED();

  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//

  /**
    @notice
    Mints ERC-721's that represent project ownership and transfers.
  */
  IJBProjects public immutable override projects;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /**
    @notice
    Each project's attached token contract.

    _projectId The ID of the project to which the token belongs.
  */
  mapping(uint256 => mapping(IJBToken721 => bool)) public override tokenOf;

  /**
    @notice
    The ID of the project that each token belongs to.

    _token The token to check the project association of.
  */
  mapping(IJBToken721 => uint256) public override projectOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    The total supply of a given token for the specified project

    @param _projectId The ID of the project to get the total token supply of.
    @param _token Token address to query.

    @return totalSupply The total supply of the project's tokens.
  */
  function totalSupplyOf(uint256 _projectId, IJBToken721 _token)
    external
    view
    override
    returns (uint256 totalSupply)
  {
    // Non-0 address
    if (address(_token) == address(0)) {
      revert INVALID_ADDRESS();
    }

    // Ensure ownership
    if (projectOf[_token] != _projectId) {
      revert INCORRECT_OWNER();
    }

    totalSupply = _token.totalSupply(_projectId);
  }

  /**
    @notice
    The total balance of tokens a holder has for a specified project, including claimed and unclaimed tokens.

    @param _holder The token holder to get a balance for.
    @param _projectId The project to get the `_holder`s balance of.
    @param _token Token to query.

    @return balance The project token balance of the `_holder
  */
  function balanceOf(
    address _holder,
    uint256 _projectId,
    IJBToken721 _token
  ) external view override returns (uint256 balance) {
    // Non-0 address
    if (address(_token) == address(0)) {
      revert INVALID_ADDRESS();
    }

    // Ensure ownership
    if (projectOf[_token] != _projectId) {
      revert INCORRECT_OWNER();
    }

    balance = _token.ownerBalance(_holder);
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
  ) JBOperatable(_operatorStore) JBControllerUtility(_directory) {
    projects = _projects;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Issues a project's ERC721 tokens that'll be used when claiming tokens.

    @dev
    Deploys a project's ERC721 token contract.

    @dev
    Only a project's current controller can issue its token.

    @param _projectId The ID of the project being issued tokens.
    @param _name The ERC721 name.
    @param _symbol The ERC721 symbol.
    @param _baseUri The ERC721 base URI.

    @return token The token that was issued.
  */
  function issueFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol,
    string calldata _baseUri,
    IJBToken721UriResolver _tokenUriResolverAddress,
    string calldata _contractUri
  ) external override onlyController(_projectId) returns (IJBToken721 token) {
    // There must be a name.
    if (bytes(_name).length == 0) {
      revert EMPTY_NAME();
    }

    // There must be a symbol.
    if (bytes(_symbol).length == 0) {
      revert EMPTY_SYMBOL();
    }

    // There must be a symbol.
    if (bytes(_baseUri).length == 0) {
      revert EMPTY_BASE_URI();
    }

    // Deploy the token contract.
    token = new JBToken721(_name, _symbol, _baseUri, _tokenUriResolverAddress, _contractUri);

    // Store the token contract.
    tokenOf[_projectId][token] = true;

    // Store the project for the token.
    projectOf[token] = _projectId;

    emit Issue(_projectId, token, _name, _symbol, _baseUri, msg.sender);
  }

  /**
    @notice
    Registers a compatible ERC721 token to a project.

    @dev
    Only a project's current controller can issue its token.

    @param _projectId The ID of the project.
    @param _token Exiting NFT address.
  */
  function RegisterFor(uint256 _projectId, IJBToken721 _token)
    external
    override
    onlyController(_projectId)
  {
    // Non-0 address
    if (address(_token) == address(0)) {
      revert INVALID_ADDRESS();
    }

    // The project shouldn't already have this token.
    if (tokenOf[_projectId][_token] != false) {
      revert PROJECT_ALREADY_HAS_TOKEN();
    }

    // Prevent cross-project token sharing
    if (projectOf[_token] != 0) {
      revert ALREADY_REGISTRED();
    }

    // TODO: should probably check NFT contract owner to ensure mint can happen, but that's not a given, must be IJBToken721 instead of IERC721 then

    // Store the token contract.
    tokenOf[_projectId][_token] = true;

    // Store the project for the token.
    projectOf[_token] = _projectId;

    emit Register(_projectId, _token, msg.sender);
  }

  /**
    @notice
    Unregisters a token from a project.

    @dev
    Only a project's current controller can perform the action.

    @param _projectId The ID of the project.
    @param _token Existing NFT address.
  */
  function DeregisterFor(uint256 _projectId, IJBToken721 _token)
    external
    override
    onlyController(_projectId)
  {
    // Non-0 address
    if (address(_token) == address(0)) {
      revert INVALID_ADDRESS();
    }

    // The project should already have this token.
    if (tokenOf[_projectId][_token] != true) {
      revert NOT_REGISTRED();
    }

    // Ensure project association
    if (projectOf[_token] != _projectId) {
      revert INCORRECT_OWNER();
    }

    // Store the token contract.
    tokenOf[_projectId][_token] = false;

    // Store the project for the token.
    projectOf[_token] = 0;

    emit Deregister(_projectId, _token, msg.sender);
  }

  /**
    @notice
    Mint new project tokens.

    @dev
    Only a project's current controller can mint its tokens.

    @param _holder The address receiving the new tokens.
    @param _projectId The ID of the project to which the tokens belong.
    @param _token Token to mint against.
  */
  function mintFor(
    address _holder,
    uint256 _projectId,
    IJBToken721 _token
  ) external override onlyController(_projectId) returns (uint256 tokenId) {
    // Ensure project registration
    if (projectOf[_token] != _projectId) {
      revert INCORRECT_OWNER();
    }

    tokenId = _token.mint(_projectId, _holder);

    emit Mint(_holder, _projectId, _token, tokenId, 1, msg.sender);
  }

  /**
    @notice
    Burns a project's tokens.

    @dev
    Only a project's current controller can burn its tokens.

    @param _projectId The ID of the project to which the burned tokens belong.
    @param _token NFT to burn token from.
    @param _holder The address that owns the tokens being burned.
  */
  function burnFrom(
    uint256 _projectId,
    IJBToken721 _token,
    address _holder,
    uint256 _tokenId
  ) external override onlyController(_projectId) {
    // Ensure project registration
    if (projectOf[_token] != _projectId) {
      revert INCORRECT_OWNER();
    }

    // Ensure token ownership
    if (_token.isOwner(_holder, _tokenId)) {
      revert INVALID_BURN_REQUEST();
    }

    _token.burn(_projectId, _holder, _tokenId);

    emit Burn(_holder, _projectId, _token, _tokenId, msg.sender);
  }
}
