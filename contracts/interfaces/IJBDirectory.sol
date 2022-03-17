// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBPaymentTerminal.sol';
import './IJBProjects.sol';
import './IJBController.sol';

interface IJBDirectory {
  event AddTerminal(uint256 indexed projectId, IJBPaymentTerminal indexed terminal, address caller);

  event SetTerminals(
    uint256 indexed projectId,
    IJBPaymentTerminal[] indexed terminals,
    address caller
  );

  event SetPrimaryTerminal(
    uint256 indexed projectId,
    address indexed token,
    IJBPaymentTerminal indexed terminal,
    address caller
  );

  event SetController(uint256 indexed projectId, IJBController indexed controller, address caller);

  event SetIsAllowedToSetController(address indexed addr, bool indexed flag, address caller);

  function projects() external view returns (IJBProjects);

  function controllerOf(uint256 _projectId) external view returns (IJBController);

  function isAllowedToSetController(address _address) external view returns (bool);

  function terminalsOf(uint256 _projectId) external view returns (IJBPaymentTerminal[] memory);

  function isTerminalOf(uint256 _projectId, IJBPaymentTerminal _terminal)
    external
    view
    returns (bool);

  function primaryTerminalOf(uint256 _projectId, address _token)
    external
    view
    returns (IJBPaymentTerminal);

  function setTerminalsOf(uint256 _projectId, IJBPaymentTerminal[] calldata _terminals) external;

  function setControllerOf(uint256 _projectId, IJBController _controller) external;

  function setPrimaryTerminalOf(uint256 _projectId, IJBPaymentTerminal _terminal) external;

  function setIsAllowedToSetController(address _address, bool _flag) external;
}
