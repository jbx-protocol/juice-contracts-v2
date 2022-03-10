// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../libraries/JBCurrencies.sol';

contract AccessJBLib {
    function ETH() external returns(uint256) {
        return JBCurrencies.ETH;
    }
    function USD() external returns(uint256) {
        return JBCurrencies.USD;
    }
}