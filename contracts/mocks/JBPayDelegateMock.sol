// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBPayDelegate.sol';

contract JBPayDelegateMock is IJBPayDelegate {
  function didPay(JBDidPayData calldata _param) external override {}
}
