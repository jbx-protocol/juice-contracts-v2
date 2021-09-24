// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../structs/DidPayData.sol';

interface IJBPayDelegate {
  function didPay(DidPayData calldata _param) external;
}
