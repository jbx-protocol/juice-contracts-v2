// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

struct JBProjectMetadataData {
  // An IPFS content ID where the metadata is found.
  string cid;
  // The domain within which the metadata applies.
  uint256 domain;
}
