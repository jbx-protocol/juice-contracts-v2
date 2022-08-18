// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import './JBFundingCycle.sol';
import '../interfaces/IJBPayDelegate.sol';

/** 
 @member fundingCycle The project's funding cycle during which payment was made.
 @member tokenCount The number of project tokens that were minted, as a fixed point number with 18 decimals.
 @member delegate A delegate contract to use for subsequent calls.
 @member delegatedAmounts The amount to send to the delegate instead of adding to the local balance.
 @member memo A memo that should be passed along to the emitted event.
*/
struct JBRecordPaymentResponse {
  JBFundingCycle fundingCycle;
  uint256 tokenCount;
  IJBPayDelegate[] delegates;
  uint256[] delegatedAmounts;
  string memo;
}
