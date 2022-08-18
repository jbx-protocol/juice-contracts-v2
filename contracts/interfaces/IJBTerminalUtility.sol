// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import './IJBDirectory.sol';

interface IJBPaymentTerminalUtility {
  function directory() external view returns (IJBDirectory);
}
