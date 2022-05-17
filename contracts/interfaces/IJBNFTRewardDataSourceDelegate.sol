// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBToken721UriResolver.sol';

interface IJBNFTRewardDataSourceDelegate {
  function totalSupply(uint256) external view returns (uint256);

  function approve(
    uint256,
    address _spender,
    uint256 _id
  ) external;

  function transfer(
    uint256 _projectId,
    address _to,
    uint256 _id
  ) external;

  function transferFrom(
    uint256 _projectId,
    address _from,
    address _to,
    uint256 _id
  ) external;

  function mint(address) external returns (uint256);

  function burn(address, uint256) external;

  function ownerBalance(address _account) external view returns (uint256);

  function isOwner(address _account, uint256 _id) external view returns (bool);

  function contractURI() external view returns (string memory);

  function setContractUri(string calldata _contractMetadataUri) external;

  function setTokenUri(string calldata _uri) external;

  function setTokenUriResolver(IJBToken721UriResolver _tokenUriResolverAddress) external;
}
