// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

interface IJBTokenUriResolver {
  function getUri(uint256 _projectId) external view returns (string memory tokenUri);
}
