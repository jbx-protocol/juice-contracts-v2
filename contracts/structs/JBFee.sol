// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBFee {
	// The total amount the fee was taken from.
	uint256 amount;
	// The percent of the fee.
	uint8 fee;
	// The address that will receive the tokens that are minted as a result of the fee payment.
	address beneficiary;
}
