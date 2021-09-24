// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleDataSource.sol';

struct FundingCycleMetadata {
  uint256 reservedRate;
  uint256 redemptionRate;
  uint256 ballotRedemptionRate;
  bool pausePay;
  bool pauseWithdraw;
  bool pauseRedeem;
  bool pauseMint;
  bool pauseBurn;
  bool useDataSourceForPay;
  bool useDataSourceForRedeem;
  IJBFundingCycleDataSource dataSource;
}
