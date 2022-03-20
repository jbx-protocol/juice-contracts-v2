// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBPaymentTerminal.sol';
import './IJBPayDelegate.sol';
import './IJBRedemptionDelegate.sol';
import './../structs/JBTokenAmount.sol';
import './../structs/JBFundingCycle.sol';

interface IJBPaymentTerminalStore {
  function currentOverflowOf(IJBPaymentTerminal _terminal, uint256 _projectId)
    external
    view
    returns (uint256);

  function currentTotalOverflowOf(
    uint256 _projectId,
    uint256 _decimals,
    uint256 _currency
  ) external view returns (uint256);

  function reclaimableOverflowOf(
    IJBPaymentTerminal _terminal,
    uint256 _projectId,
    uint256 _tokenCount
  ) external view returns (uint256);

  function recordPaymentFrom(
    address _payer,
    JBTokenAmount memory _amount,
    uint256 _projectId,
    address _beneficiary,
    uint256 _baseWeightCurrency,
    string memory _memo,
    bytes memory _metadata
  )
    external
    returns (
      JBFundingCycle memory fundingCycle,
      uint256 tokenCount,
      IJBPayDelegate delegate,
      string memory memo
    );

  function recordDistributionFor(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _balanceCurrency
  ) external returns (JBFundingCycle memory fundingCycle, uint256 distributedAmount);

  function recordUsedAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _balanceCurrency
  ) external returns (JBFundingCycle memory fundingCycle, uint256 withdrawnAmount);

  function recordRedemptionFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenCount,
    uint256 _balanceDecimals,
    uint256 _balanceCurrency,
    address payable _beneficiary,
    string memory _memo,
    bytes memory _metadata
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
