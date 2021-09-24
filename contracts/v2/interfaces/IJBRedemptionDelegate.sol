// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBFundingCycleStore.sol';

import './../structs/DidRedeemData.sol';

interface IJBRedemptionDelegate {
  function didRedeem(DidRedeemData calldata _param) external;
}
