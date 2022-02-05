// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBDirectory.sol';

interface IJBTerminalUtility {
	function directory() external view returns (IJBDirectory);
}
