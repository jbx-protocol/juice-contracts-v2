// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBFundingCycleStore.sol';

import './IJBPayDelegate.sol';
import './IJBRedemptionDelegate.sol';

import './../structs/JBPayParamsData.sol';
import './../structs/JBRedeemParamsData.sol';

interface IJBFundingCycleDataSource {
  function payParams(JBPayParamsData calldata _param)
    external
    returns (
      uint256 weight,
      string memory memo,
      IJBPayDelegate delegate,
      bytes memory delegateMetadata
    );

  function redeemParams(JBRedeemParamsData calldata _param)
    external
    returns (
      uint256 amount,
      string memory memo,
      IJBRedemptionDelegate delegate,
      bytes memory delegateMetadata
    );
}
