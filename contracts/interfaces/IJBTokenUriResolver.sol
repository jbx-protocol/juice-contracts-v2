// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

interface IJBTokenUriResolver {
  event SetUri(uint256 indexed projectId, string oldUri, string newUri);

  function setUri(uint256 projectId, string memory newUri) external returns (bool success);

  function getUri(uint256 _projectId) external view returns (string memory tokenUri);
}
