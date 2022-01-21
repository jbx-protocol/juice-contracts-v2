// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

import './IJBTerminal.sol';

interface IJBProjects is IERC721 {
  event Create(uint256 indexed projectId, address indexed owner, string uri, address caller);

  event SetUri(uint256 indexed projectId, string uri, address caller);

  function count() external view returns (uint256);

  function metadataCidOf(uint256 _projectId) external view returns (string memory);

  function createFor(address _owner, string calldata _metadataCid) external returns (uint256 id);

  function setMetadataCidOf(uint256 _projectId, string calldata _metadataCid) external;
}
