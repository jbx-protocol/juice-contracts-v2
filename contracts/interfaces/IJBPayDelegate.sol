// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './../structs/JBDidPayData.sol';

interface IJBPayDelegate is IERC165 {
  function didPay(JBDidPayData calldata _data) payable external;
}
