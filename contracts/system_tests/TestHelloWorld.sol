// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestHelloWorld is TestBaseWorkflow {
  function testHelloWorld() public {
    JBPaymentTerminalStore terminalStore = jbPaymentTerminalStore();

    assertEq(terminalStore.balanceOf(1), 0);

    assertTrue(jbDirectory().isAllowedToSetController(address(jbController())));

    emit log('Hello world');
  }
}
