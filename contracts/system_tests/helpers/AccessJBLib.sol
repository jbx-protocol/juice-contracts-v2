// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../libraries/JBCurrencies.sol';
import '../../libraries/JBConstants.sol';

contract AccessJBLib {
    function ETH() external returns(uint256) {
        return JBCurrencies.ETH;
    }
    function USD() external returns(uint256) {
        return JBCurrencies.USD;
    }
    function MAX_FEE() external returns(uint256) {
        return JBConstants.MAX_FEE;
    }
}