// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBDirectory.sol';
import './IJBVault.sol';

interface IJBTerminal {
  function vault() external view returns (IJBVault);

  function currentETHBalanceOf(uint256 _projectId) external view returns (uint256);

  function usedOverflowAllowanceOf(uint256 _projectId, uint256 _configuration)
    external
    view
    returns (uint256);

  function pay(
    uint256 _projectId,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string calldata _memo,
    bytes calldata _delegateMetadata
  ) external payable returns (uint256 fundingCycleId);

  function addToBalanceOf(uint256 _projectId, string memory _memo) external payable;
}
