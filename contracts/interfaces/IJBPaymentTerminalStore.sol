// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBPayDelegate.sol';
import './IJBRedemptionDelegate.sol';
import './IJBPaymentTerminal.sol';
import './IJBPrices.sol';

import './../structs/JBFundingCycle.sol';

interface IJBPaymentTerminalStore {
  function targetDecimals() external view returns (uint256);

  function currentOverflowOf(IJBPaymentTerminal _terminal, uint256 _projectId)
    external
    view
    returns (uint256);

  function recordPaymentFrom(
    address _payer,
    uint256 _amount,
    uint256 _projectId,
    address _beneficiary,
    string memory _memo
  )
    external
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 weight,
      uint256 tokenCount,
      IJBPayDelegate delegate,
      string memory memo
    );

  function recordDistributionFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency
  ) external returns (JBFundingCycle memory fundingCycle, uint256 distributedAmount);

  function recordUsedAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency
  ) external returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount);

  function recordRedemptionFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _currency,
    address payable _beneficiary,
    string memory _memo
  )
    external
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 reclaimAmount,
      IJBRedemptionDelegate delegate,
      string memory memo
    );

  function recordAddedBalanceFor(uint256 _projectId, uint256 _amount)
    external
    returns (JBFundingCycle memory fundingCycle);

  function recordMigration(uint256 _projectId) external returns (uint256 balance);
}
