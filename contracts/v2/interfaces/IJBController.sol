// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBDirectory.sol';
import './IJBTerminal.sol';
import './IJBFundingCycleStore.sol';

interface IJBController {
  function reservedTokenBalanceOf(uint256 _projectId, uint256 _reservedRate)
    external
    view
    returns (uint256);

  function prepForMigrationOf(uint256 _projectId, IJBController _from) external;

  function swapTerminalOf(uint256 _projectId, IJBTerminal _terminal) external;

  function mintTokensOf(
    uint256 _projectId,
    uint256 _tokenCount,
    address _beneficiary,
    string calldata _memo,
    bool _preferClaimedTokens,
    bool _shouldReserveTokens
  ) external;

  function burnTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    string calldata _memo,
    bool _preferClaimedTokens
  ) external;

  function signalWithdrawlFrom(uint256 _projectId, uint256 _amount)
    external
    returns (JBFundingCycle memory);

  function overflowAllowanceOf(
    uint256 _projectId,
    uint256 _configuration,
    IJBTerminal _terminal
  ) external view returns (uint256);
}
