// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBSplitAllocator.sol';

struct JBSplit {
	// A flag that only has effect if a projectId is also specified, and that project has issued its tokens.
	// If so, this flag indicates if the tokens that result from making a payment to the project should be delivered staked or unstaked to the beneficiary.
	bool preferClaimed;
	// The percent of the whole group that this split occupies. This number is out of 1000000000.
	uint256 percent;
	// If an allocator is not set but a projectId is set, funds will be sent to the Juicebox treasury belonging to the project who's ID is specified.
	// Resulting tokens will be routed to the beneficiary with the unstaked token preference respected.
	uint256 projectId;
	// The role the  beneficary depends on whether or not projectId is specified, or whether or not allocator is specified.
	// If allocator is set, the beneficiary will be forwarded to the allocator for it to use.
	// If allocator is not set but projectId is set, the beneficiary is the address to which the project's tokens will be sent that result from a payment to it.
	// If neither allocator or projectId are set, the beneficiary is where the funds from the split will be sent.
	address payable beneficiary;
	// Specifies if the split should be unchangeable until the specifies time comes, with the exception of extending the lockedUntil period.
	uint256 lockedUntil;
	// If an allocator is specified, funds will be sent to the allocator contract along with the projectId, beneficiary, preferClaimed properties.
	IJBSplitAllocator allocator;
}
