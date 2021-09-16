// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "./IJBTerminal.sol";
import "./IJBProjects.sol";

interface IJBDirectory {
    event SetTerminal(
        uint256 indexed projectId,
        IJBTerminal indexed terminal,
        address caller
    );

    function projects() external view returns (IJBProjects);

    function terminalOf(uint256 _projectId) external view returns (IJBTerminal);

    function setTerminalOf(uint256 _projectId, IJBTerminal _terminal) external;
}
