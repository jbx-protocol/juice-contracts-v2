// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./IJBOperatorStore.sol";
import "./IJBProjects.sol";
import "./IJBSplitAllocator.sol";

struct Split {
    bool preferUnstaked;
    uint16 percent;
    uint48 lockedUntil;
    address payable beneficiary;
    IJBSplitAllocator allocator;
    uint56 projectId;
}

interface IJBSplitsStore {
    event SetSplit(
        uint256 indexed projectId,
        uint256 indexed domain,
        uint256 indexed group,
        Split split,
        address caller
    );

    function projects() external view returns (IJBProjects);

    function splitsOf(
        uint256 _projectId,
        uint256 _domain,
        uint256 _group
    ) external view returns (Split[] memory);

    function set(
        uint256 _projectId,
        uint256 _domain,
        uint256 _group,
        Split[] memory _splits
    ) external;
}
