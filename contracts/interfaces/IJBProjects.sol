// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

import './IJBTerminal.sol';

import './../structs/JBProjectMetadata.sol';

interface IJBProjects is IERC721 {
  event Create(
    uint256 indexed projectId,
    address indexed owner,
    bytes32 indexed handle,
    JBProjectMetadata metadata,
    address caller
  );

  event SetMetadata(uint256 indexed projectId, JBProjectMetadata metadata, address caller);

  function count() external view returns (uint256);

  function metadataCidOf(uint256 _projectId, uint256 _domain) external view returns (string memory);

  function createFor(address _owner, string calldata _metadataCid) external returns (uint256 id);

  function setMetadataOf(uint256 _projectId, JBProjectMetadata calldata _metadata) external;
}
