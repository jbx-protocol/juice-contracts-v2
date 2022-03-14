// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import './interfaces/IJBToken.sol';

/** 
  @notice
  An ERC-20 token that can be used by a project in the `JBTokenStore`.

  @dev
  Adheres to:
  IJBToken: Allows this contract to be used by projects in the JBTokenStore.

  @dev
  Inherits from:
  ERC20: General token standard for fungible accounting. 
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
*/
contract JBToken is IJBToken, ERC20, Ownable {
  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /** 
    @notice
    The total supply of this ERC20.

    @return The total supply of this ERC20, as a fixed point number with 18 decimals.
  */
  function totalSupply(uint256) external view override returns (uint256) {
    return super.totalSupply();
  }

  /** 
    @notice
    An account's balance of this ERC20.

    @param _account The account to get a balance of.

    @return The balance of the `_account` of this ERC20, as a fixed point number with 18 decimals.
  */
  function balanceOf(address _account, uint256) external view override returns (uint256) {
    return super.balanceOf(_account);
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _name The name of the token.
    @param _symbol The symbol that the token should be represented by.
  */
  constructor(string memory _name, string memory _symbol)
    ERC20(_name, _symbol)
  // solhint-disable-next-line no-empty-blocks
  {

  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /** 
    @notice
    Mints more of the token.

    @dev
    Only the owner of this contract cant mint more of it.

    @param _account The account to mint the tokens for.
    @param _amount The amount of tokens to mint, as a fixed point number with 18 decimals.
  */
  function mint(
    uint256,
    address _account,
    uint256 _amount
  ) external override onlyOwner {
    return _mint(_account, _amount);
  }

  /** 
    @notice
    Burn some outstanding tokens.

    @dev
    Only the owner of this contract cant burn some of its supply.

    @param _account The account to burn tokens from.
    @param _amount The amount of tokens to burn, as a fixed point number with 18 decimals.
  */
  function burn(
    uint256,
    address _account,
    uint256 _amount
  ) external override onlyOwner {
    return _burn(_account, _amount);
  }

  /** 
    @notice
    Transfer tokens between accounts.

    @param _spender The address that will be spending tokens on the `msg.sender`s behalf.
    @param _amount The amount the `_spender` is allowed to spend.
  */
  function approve(
    uint256,
    address _spender,
    uint256 _amount
  ) external override {
    approve(_spender, _amount);
  }

  /** 
    @notice
    Transfer tokens to an account.

    @param _to The destination address.
    @param _amount The amount of the transfer, as a fixed point number with 18 decimals.
  */
  function transfer(
    uint256,
    address _to,
    uint256 _amount
  ) external override {
    transfer(_to, _amount);
  }

  /** 
    @notice
    Transfer tokens between accounts.

    @param _from The originating address.
    @param _to The destination address.
    @param _amount The amount of the transfer, as a fixed point number with 18 decimals.
  */
  function transferFrom(
    uint256,
    address _from,
    address _to,
    uint256 _amount
  ) external override {
    transferFrom(_from, _to, _amount);
  }

  /** 
    @notice
    Transfer ownership of this contract to another address.

    @dev
    Only the owner of this contract can transfer it.

    @param _newOwner The new owner.
  */
  function transferOwnership(address _newOwner)
    public
    virtual
    override(Ownable, IJBToken)
    onlyOwner
  {
    return super.transferOwnership(_newOwner);
  }
}
