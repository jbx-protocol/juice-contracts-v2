// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol';

import './interfaces/IJBToken.sol';

import '@openzeppelin/contracts/access/Ownable.sol';

contract JBToken is IJBToken, ERC20, ERC20Permit, Ownable {
  function owner() public view virtual override(Ownable, IJBToken) returns (address) {
    return super.owner();
  }

  constructor(string memory _name, string memory _symbol)
    ERC20(_name, _symbol)
    ERC20Permit(_name)
  {}

  function mint(address _account, uint256 _amount) external override onlyOwner {
    return _mint(_account, _amount);
  }

  function burn(address _account, uint256 _amount) external override onlyOwner {
    return _burn(_account, _amount);
  }

  function transferOwnership(address _newOwner) public virtual override(Ownable, IJBToken) {
    return super.transferOwnership(_newOwner);
  }
}
