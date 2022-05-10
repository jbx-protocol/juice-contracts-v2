// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../interfaces/IJBToken721.sol';

/**
  @notice Sample implementation of IJBToken721UriResolver for tests.
 */
contract JBToken721SampleUriResolver is IJBToken721UriResolver {
  string public baseUri;

  constructor(string memory _uri) {
    baseUri = _uri;
  }

  function tokenURI(uint256) external view override returns (string memory uri) {
    uri = baseUri;
  }
}
