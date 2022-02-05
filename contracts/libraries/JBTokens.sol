// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

library JBTokens {
    /** 
    @notice 
    The ETH token address in Juicebox is represented by 0x000000000000000000000000000000000000eeee.

    @dev
    This address is guaranteed to never conflict with other tokens per the following:
    https://github.com/ethereum/EIPs/pull/1352/files#diff-02f3b07abd45fe04d908b93f8b7aa6d7
  */
    address public constant ETH = address(0xeeee);
}
