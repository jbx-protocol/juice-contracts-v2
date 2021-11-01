// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IJBToken is IERC20 {
  function mint(
    address _account,
    uint256 _amount,
    uint256 _projectId
  ) external;

  function burn(
    address _account,
    uint256 _amount,
    uint256 _projectId
  ) external;

  function transferOwnership(address newOwner) external;
}
