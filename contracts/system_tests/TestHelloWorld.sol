// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './TestBaseWorkflow.sol';

contract TestHelloWorld is TestBaseWorkflow {
  function testHelloWorld() public view {
    require(
      jbOperatorStore().hasPermission(address(0), address(0), 1, 1) == false,
      'Should not have permission'
    );
  }
}
