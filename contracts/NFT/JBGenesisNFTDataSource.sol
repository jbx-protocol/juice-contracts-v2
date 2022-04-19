// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBPayDelegate.sol';
import './../structs/JBPayParamsData.sol';
import './../structs/JBRedeemParamsData.sol';

contract JBGenesisNFTDataSource is IJBFundingCycleDataSource {
  IJBPayDelegate public immutable payDelegate;

  constructor(IJBPayDelegate _payDelegate) {
    payDelegate = _payDelegate;
  }

  function payParams(JBPayParamsData calldata _data)
    external
    view
    override
    returns (
      uint256 weight,
      string memory memo,
      IJBPayDelegate delegate
    ) {
      weight = _data.weight;
      memo = _data.memo;
      delegate = payDelegate;
    }

  function redeemParams(JBRedeemParamsData calldata _data)
    external
    pure
    override
    returns (
      uint256 reclaimAmount,
      string memory memo,
      IJBRedemptionDelegate delegate
    )
    // solhint-disable-next-line no-empty-blocks
    { }
}
