// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBOperatorData {
	// The address of the operator.
	address operator;
	// The domain within which the operator is being given permissions.
	uint256 domain;
	// The indexes of the permissions the operator is being given.
	uint256[] permissionIndexes;
}
