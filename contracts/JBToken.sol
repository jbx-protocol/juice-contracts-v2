// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import './interfaces/IJBToken.sol';

/** 
  @notice
  An ERC-20 token that can be minted and burned by its owner.
*/
contract JBToken is IJBToken, ERC20Votes, Ownable {
  function totalSupply(uint256) external view override returns (uint256) {
    return super.totalSupply();
  }

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
    ERC20Permit(_name)
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
    @param _amount The amount of tokens to mint.
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
    @param _amount The amount of tokens to burn.
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
    Transfer ownership of this contract to another address.

    @dev
    Only the owner of this contract can transfer it.

    @dev
    This is necessary to override to adhere to the IJBToken interface.

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

  /** 
    @notice
    Transfer tokens between accounts.

    @param _from The originating address.
    @param _to The destination address.
    @param _amount The amount of the transfer.

    @return A flag indicating a successful transfer.
  */
  function transferFrom(
    address _from,
    address _to,
    uint256 _amount
  ) public override(ERC20, IJBToken) returns (bool) {
    return super.transferFrom(_from, _to, _amount);
  }
}
