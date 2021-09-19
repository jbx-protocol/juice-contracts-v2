// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBTerminal.sol';
import './IJBProjects.sol';

interface IJBDirectory {
  event SetTerminal(uint256 indexed projectId, IJBTerminal indexed terminal, address caller);

  function projects() external view returns (IJBProjects);

  function terminalOf(uint256 _projectId, uint256 _domain) external view returns (IJBTerminal);

  function terminalsOf(uint256 _projectId) external view returns (IJBTerminal[] memory);

  function isTerminalOf(uint256 _projectId, address _terminal) external view returns (bool);

  function addTerminalOf(uint256 _projectId, IJBTerminal _terminal) external;

  // function setTerminalOf(uint256 _projectId, IJBTerminal _terminal) external;

  function transferTerminalOf(uint256 _projectId, IJBTerminal _terminal) external;
}
