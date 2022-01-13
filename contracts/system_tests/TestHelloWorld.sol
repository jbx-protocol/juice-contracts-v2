// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './TestBaseWorkflow.sol';

contract TestHelloWorld is TestBaseWorkflow {
  function testHelloWorld() public {
    require(_jbPrices.hasPermission(address(0), address(0), 1, 1));
  }
}
