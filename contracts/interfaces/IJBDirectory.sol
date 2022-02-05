// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBTerminal.sol';
import './IJBProjects.sol';
import './IJBController.sol';

interface IJBDirectory {
    event SetController(
        uint256 indexed projectId,
        IJBController indexed controller,
        address caller
    );

    event AddTerminal(
        uint256 indexed projectId,
        IJBTerminal indexed terminal,
        address caller
    );

    event RemoveTerminal(
        uint256 indexed projectId,
        IJBTerminal indexed terminal,
        address caller
    );

    event SetPrimaryTerminal(
        uint256 indexed projectId,
        address indexed token,
        IJBTerminal indexed terminal,
        address caller
    );

    event AddToSetControllerAllowlist(address indexed _address, address caller);

    event RemoveFromSetControllerAllowlist(
        address indexed _address,
        address caller
    );

    function projects() external view returns (IJBProjects);

    function controllerOf(uint256 _projectId)
        external
        view
        returns (IJBController);

    function isAllowedToSetController(address _address)
        external
        view
        returns (bool);

    function primaryTerminalOf(uint256 _projectId, address _token)
        external
        view
        returns (IJBTerminal);

    function terminalsOf(uint256 _projectId)
        external
        view
        returns (IJBTerminal[] memory);

    function isTerminalOf(uint256 _projectId, IJBTerminal _terminal)
        external
        view
        returns (bool);

    function isTerminalDelegateOf(uint256 _projectId, address _delegate)
        external
        view
        returns (bool);

    function addTerminalsOf(
        uint256 _projectId,
        IJBTerminal[] calldata _terminals
    ) external;

    function removeTerminalOf(uint256 _projectId, IJBTerminal _terminal)
        external;

    function setControllerOf(uint256 _projectId, IJBController _controller)
        external;

    function setPrimaryTerminalOf(uint256 _projectId, IJBTerminal _terminal)
        external;

    function addToSetControllerAllowlist(address _address) external;

    function removeFromSetControllerAllowlist(address _address) external;
}
