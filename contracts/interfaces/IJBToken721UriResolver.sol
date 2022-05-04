// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/**
  @notice
  Intended to serve custom ERC721 token URIs.
 */
interface IJBToken721UriResolver {
  function tokenURI(uint256 tokenId) external view returns (string memory);
}
