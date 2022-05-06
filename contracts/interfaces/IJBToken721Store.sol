// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBProjects.sol';
import './IJBToken721.sol';
import './IJBToken721UriResolver.sol';

interface IJBToken721Store {
  event Issue(
    uint256 indexed projectId,
    IJBToken721 indexed token,
    string name,
    string symbol,
    string baseUri,
    address caller
  );

  event Register(uint256 indexed projectId, IJBToken721 indexed token, address caller);

  event Deregister(uint256 indexed projectId, IJBToken721 indexed token, address caller);

  event Mint(
    address indexed holder,
    uint256 indexed projectId,
    IJBToken721 token,
    uint256 tokenId,
    uint256 amount,
    address caller
  );

  event Burn(
    address indexed holder,
    uint256 indexed projectId,
    IJBToken721 token,
    uint256 tokenId,
    address caller
  );

  event Transfer(
    address indexed holder,
    uint256 indexed projectId,
    address indexed recipient,
    uint256 amount,
    address caller
  );

  function tokenOf(uint256, IJBToken721) external view returns (bool);

  function projectOf(IJBToken721) external view returns (uint256);

  function projects() external view returns (IJBProjects);

  function totalSupplyOf(uint256 _projectId, IJBToken721 _token) external view returns (uint256);

  function balanceOf(
    address _holder,
    uint256 _projectId,
    IJBToken721 _token
  ) external view returns (uint256 _result);

  function issueFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol,
    string calldata _baseUri,
    IJBToken721UriResolver _tokenUriResolverAddress,
    string calldata _contractUri
  ) external returns (IJBToken721 token);

  function RegisterFor(uint256 _projectId, IJBToken721 _token) external;

  function DeregisterFor(uint256 _projectId, IJBToken721 _token) external;

  function burnFrom(
    uint256 _projectId,
    IJBToken721 _token,
    address _holder,
    uint256 _tokenId
  ) external;

  function mintFor(
    address _holder,
    uint256 _projectId,
    IJBToken721 _token
  ) external returns (uint256);
}
