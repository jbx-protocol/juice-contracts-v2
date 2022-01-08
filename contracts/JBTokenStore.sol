// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './abstract/JBOperatable.sol';
import './abstract/JBControllerUtility.sol';
import './interfaces/IJBTokenStore.sol';
import 'hardhat/console.sol';

import './libraries/JBOperations.sol';
import './JBToken.sol';

// --------------------------- custom errors -------------------------- //
//*********************************************************************//
error EMPTY_NAME();
error EMPTY_SYMBOL();
error INSUFFICIENT_FUNDS();
error INVALID_RECIPIENT();
error INSUFFICIENT_UNCLAIMED_TOKENS();
error RECIPIENT_ZERO_ADDRESS();
error TOKEN_AMOUNT_ZERO();
error TOKEN_NOT_FOUND();
error TOKEN_ALREADY_ISSUED();

/**
  @notice
  Manage Token minting, burning, and account balances.

  @dev
  Tokens can be either represented internally or claimed as ERC-20s.
  This contract manages these two representations and allows claiming.

  @dev
  The total supply of a project's tokens and the balance of each account are calculated in this contract.

  @dev
  Each project can bring their own token if they prefer, and swap between tokens at any time.
*/
contract JBTokenStore is JBControllerUtility, JBOperatable, IJBTokenStore {
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
    Each project's ERC20 Token tokens.

    _projectId The ID of the project to which the token belongs.
  */
  mapping(uint256 => IJBToken) public override tokenOf;

  /**
    @notice
    Each holder's balance of unclaimed Tokens for each project.

    _holder The holder of balance.
    _projectId The ID of the project to which the token belongs.
  */
  mapping(address => mapping(uint256 => uint256)) public override unclaimedBalanceOf;

  /**
    @notice
    The total supply of unclaimed tokens for each project.

    _projectId The ID of the project to which the token belongs.
  */
  mapping(uint256 => uint256) public override unclaimedTotalSupplyOf;

  /**
    @notice
    A flag indicating if tokens are required to be issued as claimed for a particular project.

    _projectId The ID of the project to which the requirement applies.
  */
  mapping(uint256 => bool) public override requireClaimFor;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice
    The total supply of tokens for each project, including claimed and unclaimed tokens.

    @param _projectId The ID of the project to get the total token supply of.

    @return supply The total supply.
  */
  function totalSupplyOf(uint256 _projectId) external view override returns (uint256 supply) {
    // Get a reference to the unclaimed total supply of the project.
    supply = unclaimedTotalSupplyOf[_projectId];

    // Get a reference to the project's token.
    IJBToken _token = tokenOf[_projectId];

    // If the project has issued a token, add it's total supply to the total.
    if (_token != IJBToken(address(0))) supply = supply + _token.totalSupply(_projectId);
  }

  /**
    @notice
    The total balance of token a holder has for a specified project, including claimed and unclaimed tokens.

    @param _holder The token holder to get a balance for.
    @param _projectId The project to get the `_hodler`s balance of.

    @return balance The balance.
  */
  function balanceOf(address _holder, uint256 _projectId)
    external
    view
    override
    returns (uint256 balance)
  {
    // Get a reference to the holder's unclaimed balance for the project.
    balance = unclaimedBalanceOf[_holder][_projectId];

    // Get a reference to the project's token.
    IJBToken _token = tokenOf[_projectId];

    // If the project has issued a token, add the holder's balance to the total.
    if (_token != IJBToken(address(0))) balance = balance + _token.balanceOf(_projectId, _holder);
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
    Issues an owner's ERC-20 Tokens that'll be used when claiming tokens.

    @dev
    Deploys a project's ERC-20 token contract.

    @dev
    Only a project's current controller can issue its token.

    @param _projectId The ID of the project being issued tokens.
    @param _name The ERC-20's name.
    @param _symbol The ERC-20's symbol.
  */
  function issueFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol
  ) external override onlyController(_projectId) returns (IJBToken token) {
    // There must be a name.
    if (bytes(_name).length == 0) {
      revert EMPTY_NAME();
    }

    // There must be a symbol.
    if (bytes(_symbol).length == 0) {
      revert EMPTY_SYMBOL();
    }

    // Only one ERC20 token can be issued.
    if (tokenOf[_projectId] != IJBToken(address(0))) {
      revert TOKEN_ALREADY_ISSUED();
    }

    // Deploy the token contract.
    token = new JBToken(_name, _symbol);

    // Store the token contract.
    tokenOf[_projectId] = token;

    emit Issue(_projectId, token, _name, _symbol, msg.sender);
  }

  /**
    @notice
    Swap the current project's token that is minted and burned for another, and transfer ownership of the current token to another address if needed.

    @dev
    Only a project's current controller can change its token.

    @param _projectId The ID of the project to which the changed token belongs.
    @param _token The new token.
    @param _newOwner An address to transfer the current token's ownership to. This is optional, but it cannot be done later.
  */
  function changeFor(
    uint256 _projectId,
    IJBToken _token,
    address _newOwner
  ) external override onlyController(_projectId) {
    // Get a reference to the current owner of the token.
    IJBToken _currentToken = tokenOf[_projectId];

    // Store the new token.
    tokenOf[_projectId] = _token;

    // If there's a current token and a new owner was provided, transfer ownership of the old token to the new owner.
    if (_newOwner != address(0) && _currentToken != IJBToken(address(0)))
      _currentToken.transferOwnership(_newOwner);

    emit Change(_projectId, _token, _newOwner, msg.sender);
  }

  /**
    @notice
    Mint new tokens.

    @dev
    Only a project's current controller can mint its tokens.

    @param _holder The address receiving the new tokens.
    @param _projectId The ID of the project to which the tokens belong.
    @param _amount The amount of tokens to mint.
    @param _preferClaimedTokens A flag indicating whether there's a preference for ERC20's to be claimed automatically if they have been issued.
  */
  function mintFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount,
    bool _preferClaimedTokens
  ) external override onlyController(_projectId) {
    // An amount must be specified.
    if (_amount == 0) {
      revert TOKEN_AMOUNT_ZERO();
    }

    // Get a reference to the project's ERC20 tokens.
    IJBToken _token = tokenOf[_projectId];

    // If there exists ERC-20 tokens and the caller prefers these claimed tokens or the project requires it.
    bool _shouldClaimTokens = (requireClaimFor[_projectId] || _preferClaimedTokens) &&
      _token != IJBToken(address(0));

    if (_shouldClaimTokens) {
      // Mint the equivalent amount of ERC20s.
      _token.mint(_projectId, _holder, _amount);
    } else {
      // Add to the unclaimed balance and total supply.
      unclaimedBalanceOf[_holder][_projectId] = unclaimedBalanceOf[_holder][_projectId] + _amount;
      unclaimedTotalSupplyOf[_projectId] = unclaimedTotalSupplyOf[_projectId] + _amount;
    }

    emit Mint(_holder, _projectId, _amount, _shouldClaimTokens, _preferClaimedTokens, msg.sender);
  }

  /**
    @notice
    Burns tokens.

    @dev
    Only a project's current controller can burn its tokens.

    @param _holder The address that owns the tokens being burned.
    @param _projectId The ID of the project to which the burned tokens belong
    @param _amount The amount of tokens to burned.
    @param _preferClaimedTokens A flag indicating if there's a preference to burn tokens that have been converted to ERC-20s.
  */
  function burnFrom(
    address _holder,
    uint256 _projectId,
    uint256 _amount,
    bool _preferClaimedTokens
  ) external override onlyController(_projectId) {
    // An amount must be specified.
    if (_amount == 0) {
      revert TOKEN_AMOUNT_ZERO();
    }
    // Get a reference to the project's ERC20 tokens.
    IJBToken _token = tokenOf[_projectId];

    // Get a reference to the amount of unclaimed tokens.
    uint256 _unclaimedBalance = unclaimedBalanceOf[_holder][_projectId];

    // Get a reference to the number of tokens there are.
    uint256 _claimedBalance = _token == IJBToken(address(0))
      ? 0
      : _token.balanceOf(_projectId, _holder);

    if (
      (_amount >= _claimedBalance || _amount >= _unclaimedBalance) &&
      (_amount < _claimedBalance || _unclaimedBalance < _amount - _claimedBalance) &&
      (_amount < _unclaimedBalance || _claimedBalance < _amount - _unclaimedBalance)
    ) {
      revert INSUFFICIENT_FUNDS();
    }
    // The amount of tokens to burn.
    uint256 _claimedTokensToBurn;

    // If there's no balance, redeem no tokens.
    if (_claimedBalance == 0) {
      _claimedTokensToBurn = 0;
      // If prefer converted, redeem tokens before redeeming unclaimed tokens.
    } else if (_preferClaimedTokens) {
      _claimedTokensToBurn = _claimedBalance >= _amount ? _amount : _claimedBalance;
      // Otherwise, redeem unclaimed tokens before claimed tokens.
    } else {
      _claimedTokensToBurn = _unclaimedBalance >= _amount ? 0 : _amount - _unclaimedBalance;
    }

    // The amount of unclaimed tokens to redeem.
    uint256 _unclaimedTokensToBurn = _amount - _claimedTokensToBurn;

    // burn the tokens.
    if (_claimedTokensToBurn > 0) _token.burn(_projectId, _holder, _claimedTokensToBurn);
    if (_unclaimedTokensToBurn > 0) {
      // Reduce the holders balance and the total supply.
      unclaimedBalanceOf[_holder][_projectId] =
        unclaimedBalanceOf[_holder][_projectId] -
        _unclaimedTokensToBurn;
      unclaimedTotalSupplyOf[_projectId] =
        unclaimedTotalSupplyOf[_projectId] -
        _unclaimedTokensToBurn;
    }

    emit Burn(_holder, _projectId, _amount, _unclaimedBalance, _preferClaimedTokens, msg.sender);
  }

  /**
    @notice
    Claims internal tokens by minting and distributing ERC20 tokens.

    @dev
    Anyone can claim tokens on behalf of a token owner.

    @param _holder The owner of the tokens to claim.
    @param _projectId The ID of the project whose tokens are being claimed.
    @param _amount The amount of tokens to claim.
  */
  function claimFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external override {
    // Get a reference to the project's ERC20 tokens.
    IJBToken _token = tokenOf[_projectId];

    // Tokens must have been issued.
    if (_token == IJBToken(address(0))) {
      revert TOKEN_NOT_FOUND();
    }

    // Get a reference to the amount of unclaimed tokens.
    uint256 _unclaimedBalance = unclaimedBalanceOf[_holder][_projectId];

    // There must be enough unlocked unclaimed tokens to claim.
    if (_unclaimedBalance < _amount) {
      revert INSUFFICIENT_UNCLAIMED_TOKENS();
    }

    // Subtract the claim amount from the holder's balance.
    unclaimedBalanceOf[_holder][_projectId] = unclaimedBalanceOf[_holder][_projectId] - _amount;

    // Subtract the claim amount from the project's total supply.
    unclaimedTotalSupplyOf[_projectId] = unclaimedTotalSupplyOf[_projectId] - _amount;

    // Mint the equivalent amount of ERC20s.
    _token.mint(_projectId, _holder, _amount);

    emit Claim(_holder, _projectId, _amount, msg.sender);
  }

  /**
    @notice
    Allows an unclaimed token holder to transfer them to another account, without claiming to ERC-20s.

    @dev
    Only a token holder or an operator can transfer its unclaimed tokens.

    @param _recipient The recipient of the tokens.
    @param _holder The address to transfer tokens from.
    @param _projectId The ID of the project whose tokens are being transferred.
    @param _amount The amount of tokens to transfer.
  */
  function transferTo(
    address _recipient,
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external override requirePermission(_holder, _projectId, JBOperations.TRANSFER) {
    // Can't transfer to the zero address.
    if (_recipient == address(0)) {
      revert RECIPIENT_ZERO_ADDRESS();
    }

    // An address can't transfer to itself.
    if (_holder == _recipient) {
      revert INVALID_RECIPIENT();
    }

    // There must be an amount to transfer.
    if (_amount == 0) {
      revert TOKEN_AMOUNT_ZERO();
    }
    // Get a reference to the amount of unclaimed tokens.
    uint256 _unclaimedBalance = unclaimedBalanceOf[_holder][_projectId];

    // There must be enough unclaimed tokens to transfer.
    if (_amount > _unclaimedBalance) {
      revert INSUFFICIENT_UNCLAIMED_TOKENS();
    }

    // Subtract from the holder.
    unclaimedBalanceOf[_holder][_projectId] = unclaimedBalanceOf[_holder][_projectId] - _amount;

    // Add the tokens to the recipient.
    unclaimedBalanceOf[_recipient][_projectId] =
      unclaimedBalanceOf[_recipient][_projectId] +
      _amount;

    emit Transfer(_holder, _projectId, _recipient, _amount, msg.sender);
  }

  /**
    @notice
    Allows a project to force all future mints to be claimed into the holder's wallet, or revoke the flag if it's already set.

    @dev
    Only a token holder or an operator can transfer its unclaimed tokens.

    @param _projectId The ID of the project being affected.
    @param _flag A flag indicating whether or not claiming should be required.
  */
  function shouldRequireClaimingFor(uint256 _projectId, bool _flag)
    external
    override
    requirePermission(projects.ownerOf(_projectId), _projectId, JBOperations.REQUIRE_CLAIM)
  {
    // Get a reference to the project's ERC20 tokens.
    IJBToken _token = tokenOf[_projectId];

    // Tokens must have been issued.
    if (_token == IJBToken(address(0))) {
      revert TOKEN_NOT_FOUND();
    }

    // Store the flag.
    requireClaimFor[_projectId] = _flag;

    emit ShouldRequireClaim(_projectId, _flag, msg.sender);
  }
}
