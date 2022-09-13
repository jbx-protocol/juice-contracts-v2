// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../interfaces/IJBPayDelegate.sol';

/** 
 @member delegate A delegate contract to use for subsequent calls.
 @member amount The amount to send to the delegate.
*/
struct JBPayDelegateAllocation {
  IJBPayDelegate delegate;
  uint256 amount;
}
