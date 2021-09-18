// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBProjects.sol';
import './IJBToken.sol';

interface IJBTokenStore {
  event Issue(
    uint256 indexed projectId,
    IJBToken indexed token,
    string name,
    string symbol,
    address caller
  );
  event Mint(
    address indexed holder,
    uint256 indexed projectId,
    uint256 amount,
    bool shouldUnstakeTokens,
    bool preferUnstakedTokens,
    address caller
  );

  event Burn(
    address indexed holder,
    uint256 indexed projectId,
    uint256 amount,
    uint256 unlockedStakedBalance,
    bool preferUnstakedTokens,
    address caller
  );

  event Stake(address indexed holder, uint256 indexed projectId, uint256 amount, address caller);

  event Unstake(address indexed holder, uint256 indexed projectId, uint256 amount, address caller);

  event Lock(address indexed holder, uint256 indexed projectId, uint256 amount, address caller);

  event Unlock(address indexed holder, uint256 indexed projectId, uint256 amount, address caller);

  event Transfer(
    address indexed holder,
    uint256 indexed projectId,
    address indexed recipient,
    uint256 amount,
    address caller
  );

  function tokenOf(uint256 _projectId) external view returns (IJBToken);

  function projects() external view returns (IJBProjects);

  function lockedBalanceOf(address _holder, uint256 _projectId) external view returns (uint256);

  function lockedBalanceBy(
    address _operator,
    address _holder,
    uint256 _projectId
  ) external view returns (uint256);

  function stakedBalanceOf(address _holder, uint256 _projectId) external view returns (uint256);

  function stakedTotalSupplyOf(uint256 _projectId) external view returns (uint256);

  function totalSupplyOf(uint256 _projectId) external view returns (uint256);

  function balanceOf(address _holder, uint256 _projectId) external view returns (uint256 _result);

  function issueFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol
  ) external returns (IJBToken token);

  function burnFrom(
    address _holder,
    uint256 _projectId,
    uint256 _amount,
    bool _preferUnstakedTokens
  ) external;

  function mintFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount,
    bool _preferUnstakedTokens
  ) external;

  function stakeFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external;

  function unstakeFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external;

  function lockFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external;

  function unlockFor(
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external;

  function transferTo(
    address _recipient,
    address _holder,
    uint256 _projectId,
    uint256 _amount
  ) external;
}
