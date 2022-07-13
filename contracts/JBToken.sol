// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/IJBToken.sol';

/** 
  @notice
  An ERC-20 token that can be used by a project in the `JBTokenStore`.

  @dev
  Adheres to -
  IJBToken: Allows this contract to be used by projects in the JBTokenStore.

  @dev
  Inherits from -
  ERC20Votes: General token standard for fungible membership. 
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
*/
contract JBToken is IJBToken, ERC20Votes, Ownable {
  //*********************************************************************//
  // --------------------------- custom errors ------------------------- //
  //*********************************************************************//
  error BAD_PROJECT();

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice
    The ID of the project that this token should be exclusively used for. Send 0 to support any project. 
  */
  uint256 public override projectId;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /** 
    @notice
    The total supply of this ERC20.

    @param _projectId the ID of the project to which the token belongs. This is ignored.

    @return The total supply of this ERC20, as a fixed point number.
  */
  function totalSupply(uint256 _projectId) external view override returns (uint256) {
    _projectId; // Prevents unused var compiler and natspec complaints.

    return super.totalSupply();
  }

  /** 
    @notice
    An account's balance of this ERC20.

    @param _account The account to get a balance of.
    @param _projectId is the ID of the project to which the token belongs. This is ignored.

    @return The balance of the `_account` of this ERC20, as a fixed point number with 18 decimals.
  */
  function balanceOf(address _account, uint256 _projectId)
    external
    view
    override
    returns (uint256)
  {
    _account; // Prevents unused var compiler and natspec complaints.
    _projectId; // Prevents unused var compiler and natspec complaints.

    return super.balanceOf(_account);
  }

  //*********************************************************************//
  // -------------------------- public views --------------------------- //
  //*********************************************************************//

  /** 
    @notice
    The number of decimals included in the fixed point accounting of this token.

    @return The number of decimals.
  */
  function decimals() public view override(ERC20, IJBToken) returns (uint8) {
    return super.decimals();
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _name The name of the token.
    @param _symbol The symbol that the token should be represented by.
    @param _projectId The ID of the project that this token should be exclusively used for. Send 0 to support any project.
  */
  constructor(
    string memory _name,
    string memory _symbol,
    uint256 _projectId
  )
    ERC20(_name, _symbol)
    ERC20Permit(_name) // solhint-disable-next-line no-empty-blocks
  {
    projectId = _projectId;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /** 
    @notice
    Mints more of the token.

    @dev
    Only the owner of this contract cant mint more of it.

    @param _projectId The ID of the project to which the token belongs. This is ignored.
    @param _account The account to mint the tokens for.
    @param _amount The amount of tokens to mint, as a fixed point number with 18 decimals.
  */
  function mint(
    uint256 _projectId,
    address _account,
    uint256 _amount
  ) external override onlyOwner {
    // Can't mint for a wrong project.
    if (projectId != 0 && _projectId != projectId) revert BAD_PROJECT();

    return _mint(_account, _amount);
  }

  /** 
    @notice
    Burn some outstanding tokens.

    @dev
    Only the owner of this contract cant burn some of its supply.

    @param _projectId The ID of the project to which the token belongs. This is ignored.
    @param _account The account to burn tokens from.
    @param _amount The amount of tokens to burn, as a fixed point number with 18 decimals.
  */
  function burn(
    uint256 _projectId,
    address _account,
    uint256 _amount
  ) external override onlyOwner {
    // Can't burn for a wrong project.
    if (projectId != 0 && _projectId != projectId) revert BAD_PROJECT();

    return _burn(_account, _amount);
  }

  /** 
    @notice
    Approves an account to spend tokens on the `msg.sender`s behalf.

    @param _projectId the ID of the project to which the token belongs. This is ignored.
    @param _spender The address that will be spending tokens on the `msg.sender`s behalf.
    @param _amount The amount the `_spender` is allowed to spend.
  */
  function approve(
    uint256 _projectId,
    address _spender,
    uint256 _amount
  ) external override {
    // Can't approve for a wrong project.
    if (projectId != 0 && _projectId != projectId) revert BAD_PROJECT();

    approve(_spender, _amount);
  }

  /** 
    @notice
    Transfer tokens to an account.
    
    @param _projectId The ID of the project to which the token belongs. This is ignored.
    @param _to The destination address.
    @param _amount The amount of the transfer, as a fixed point number with 18 decimals.
  */
  function transfer(
    uint256 _projectId,
    address _to,
    uint256 _amount
  ) external override {
    // Can't transfer for a wrong project.
    if (projectId != 0 && _projectId != projectId) revert BAD_PROJECT();

    transfer(_to, _amount);
  }

  /** 
    @notice
    Transfer tokens between accounts.

    @param _projectId The ID of the project to which the token belongs. This is ignored.
    @param _from The originating address.
    @param _to The destination address.
    @param _amount The amount of the transfer, as a fixed point number with 18 decimals.
  */
  function transferFrom(
    uint256 _projectId,
    address _from,
    address _to,
    uint256 _amount
  ) external override {
    // Can't transfer for a wrong project.
    if (projectId != 0 && _projectId != projectId) revert BAD_PROJECT();

    transferFrom(_from, _to, _amount);
  }
}
