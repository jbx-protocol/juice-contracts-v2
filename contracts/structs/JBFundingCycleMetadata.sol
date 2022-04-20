// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleDataSource.sol';

/** 
  @member reservedRate The reserved rate of the funding cycle. This number is a percentage calculated out of `JBConstants.MAX_RESERVED_RATE`.
  @member redemptionRate The redemption rate of the funding cycle. This number is a percentage calculated out of `JBConstants.MAX_REDEMPTION_RATE`.
  @member ballotRedemptionRate The redemption rate to use during an active ballot of the funding cycle. This number is a percentage calculated out of `JBConstants.MAX_REDEMPTION_RATE`.
  @member pausePay If the pay functionality should be paused during the funding cycle.
  @member pauseDistributions If the distribute functionality should be paused during the funding cycle.
  @member pauseRedeem If the redeem functionality should be paused during the funding cycle.
  @member pauseBurn If the burn functionality should be paused during the funding cycle.
  @member allowMinting If the mint functionality should be allowed during the funding cycle.
  @member allowChangeToken If changing tokens should be allowed during this funding cycle.
  @member allowTerminalMigration If migrating terminals should be allowed during this funding cycle.
  @member allowControllerMigration If migrating controllers should be allowed during this funding cycle.
  @member allowSetTerminals If setting terminals should be allowed during this funding cycle.
  @member allowSetController If setting a new controller should be allowed during this funding cycle.
  @member holdFees If fees should be held during this funding cycle.
  @memeber useTotalOverflowForRedemptions If redemptions should use the project's balance held in all terminals instead of the project's local terminal balance from which the redemption is being fulfilled.
  @member useDataSourceForPay If the data source should be used for pay transactions during this funding cycle.
  @member useDataSourceForRedeem If the data source should be used for redeem transactions during this funding cycle.
  @member dataSource The data source to use during this funding cycle.
*/
struct JBFundingCycleMetadata {
  uint256 reservedRate;
  uint256 redemptionRate;
  uint256 ballotRedemptionRate;
  bool pausePay;
  bool pauseDistributions;
  bool pauseRedeem;
  bool pauseBurn;
  bool allowMinting;
  bool allowChangeToken;
  bool allowTerminalMigration;
  bool allowControllerMigration;
  bool allowSetTerminals;
  bool allowSetController;
  bool holdFees;
  bool useTotalOverflowForRedemptions;
  bool useDataSourceForPay;
  bool useDataSourceForRedeem;
  IJBFundingCycleDataSource dataSource;
}
