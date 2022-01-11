// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

import './IJBProjects.sol';
import './IJBDirectory.sol';
import './IJBSplitsStore.sol';
import './IJBFundingCycleStore.sol';
import './IJBPayDelegate.sol';
import './IJBTokenStore.sol';
import './IJBPrices.sol';
import './IJBRedemptionDelegate.sol';
import './IJBController.sol';
import './IJBFeeGuage.sol';

import './../structs/JBFee.sol';

interface IJBETHPaymentTerminal {
  event AddToBalance(uint256 indexed projectId, uint256 amount, string memo, address caller);
  event Migrate(uint256 indexed projectId, IJBTerminal indexed to, uint256 amount, address caller);
  event DistributePayouts(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 amount,
    uint256 distributedAmount,
    uint256 feeAmount,
    uint256 beneficiaryDistributionAmount,
    string memo,
    address caller
  );

  event UseAllowance(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 amount,
    uint256 feeAmount,
    uint256 transferAmount,
    address caller
  );
  event ProcessFees(uint256 indexed projectId, JBFee[] fees, address caller);
  event Pay(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address beneficiary,
    uint256 amount,
    uint256 weight,
    uint256 tokenCount,
    string memo,
    address caller
  );
  event RedeemTokens(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    address holder,
    address beneficiary,
    uint256 tokenCount,
    uint256 claimedAmount,
    string memo,
    address caller
  );
  event DistributeToPayoutSplit(
    uint256 indexed fundingCycleConfiguration,
    uint256 indexed fundingCycleNumber,
    uint256 indexed projectId,
    JBSplit split,
    uint256 amount,
    address caller
  );

  event SetFee(uint256 fee, address caller);

  event SetFeeGuage(IJBFeeGuage feeGuage, address caller);

  function projects() external view returns (IJBProjects);

  function splitsStore() external view returns (IJBSplitsStore);

  function directory() external view returns (IJBDirectory);

  function heldFeesOf(uint256 _projectId) external view returns (JBFee[] memory);

  function fee() external view returns (uint256);

  function feeGuage() external view returns (IJBFeeGuage);

  function distributePayoutsOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei,
    string memory _memo
  ) external;

  function redeemTokensOf(
    address _holder,
    uint256 _projectId,
    uint256 _count,
    uint256 _minReturnedWei,
    address payable _beneficiary,
    string calldata _memo,
    bytes calldata _delegateMetadata
  ) external returns (uint256 claimedAmount);

  function useAllowanceOf(
    uint256 _projectId,
    uint256 _amount,
    uint256 _currency,
    uint256 _minReturnedWei,
    address payable _beneficiary
  ) external;

  function migrate(uint256 _projectId, IJBTerminal _to) external;
}
