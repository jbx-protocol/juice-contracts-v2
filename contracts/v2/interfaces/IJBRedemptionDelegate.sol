// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./IJBFundingCycleStore.sol";

struct DidRedeemParam {
    address holder;
    uint256 projectId;
    uint256 tokenCount;
    uint256 claimAmount;
    address payable beneficiary;
    string memo;
    bytes metadata;
}

interface IJBRedemptionDelegate {
    function didRedeem(DidRedeemParam calldata _param) external;
}
