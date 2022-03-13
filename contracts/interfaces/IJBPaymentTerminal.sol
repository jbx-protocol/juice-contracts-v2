// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBDirectory.sol';

interface IJBPaymentTerminal {
  function token() external view returns (address);

  function currency() external view returns (uint256);

  function baseWeightCurrency() external view returns (uint256);

  function payoutSplitsGroup() external view returns (uint256);

  function store() external view returns (address);

  function pay(
    uint256 _amount,
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string calldata _memo,
    bytes calldata _metadata
  ) external payable;

  function addToBalanceOf(
    uint256 _amount,
    uint256 _projectId,
    string memory _memo
  ) external payable;
}
