// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../libraries/JBCurrencies.sol';
import '../../libraries/JBConstants.sol';
import '../../libraries/JBTokens.sol';

contract AccessJBLib {
    function ETH() external returns(uint256) {
        return JBCurrencies.ETH;
    }
    function USD() external returns(uint256) {
        return JBCurrencies.USD;
    }
    function ETHToken() external returns(address) {
        return JBTokens.ETH;
    }
    function MAX_FEE() external returns(uint256) {
        return JBConstants.MAX_FEE;
    }

    function SPLITS_TOTAL_PERCENT() external returns(uint256) {
        return JBConstants.SPLITS_TOTAL_PERCENT;
    }
}