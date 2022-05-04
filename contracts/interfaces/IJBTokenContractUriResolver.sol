// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/**
  @notice
  Intended to serve OpenSea-style contract-level metadata. See https://docs.opensea.io/docs/contract-level-metadata
 */
interface IJBTokenContractUriResolver {
  function contractURI() external view returns (string memory contractUri);
}
