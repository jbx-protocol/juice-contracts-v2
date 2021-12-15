// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBFundingCycleDataSource.sol';

contract JBFundingCycleDataSourceMock is IJBFundingCycleDataSource {
  function payParams(JBPayParamsData calldata _param)
    external
    view
    override
    returns (
      uint256 weight,
      string memory memo,
      IJBPayDelegate delegate,
      bytes memory delegateMetadata
    )
  {}

  function redeemParams(JBRedeemParamsData calldata _param)
    external
    view
    override
    returns (
      uint256 amount,
      string memory memo,
      IJBRedemptionDelegate delegate,
      bytes memory delegateMetadata
    )
  {}
}
