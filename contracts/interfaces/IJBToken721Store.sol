// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBProjects.sol';
import './IJBToken721.sol';
import './IJBToken721UriResolver.sol';
import './IJBTokenContractUriResolver.sol';

interface IJBToken721Store {
  event Issue(
    uint256 indexed projectId,
    IJBToken721 indexed token,
    string name,
    string symbol,
    string baseUri,
    address caller
  );

  event Mint(
    address indexed holder,
    uint256 indexed projectId,
    uint256 tokenId,
    uint256 amount,
    bool tokensWereClaimed,
    bool preferClaimedTokens,
    address caller
  );

  event Burn(
    address indexed holder,
    uint256 indexed projectId,
    uint256 tokenId,
    uint256 amount,
    uint256 initialUnclaimedBalance,
    uint256 initialClaimedBalance,
    bool preferClaimedTokens,
    address caller
  );

  event Claim(
    address indexed holder,
    uint256 indexed projectId,
    uint256 unclaimedBalance,
    uint256 amount,
    address caller
  );

  event ShouldRequireClaim(uint256 indexed projectId, bool indexed flag, address caller);

  event Change(
    uint256 indexed projectId,
    IJBToken721 indexed newToken,
    IJBToken721 indexed oldToken,
    address owner,
    address caller
  );

  event Transfer(
    address indexed holder,
    uint256 indexed projectId,
    address indexed recipient,
    uint256 amount,
    address caller
  );

  function tokenOf(uint256 _projectId) external view returns (IJBToken721);

  function projectOf(IJBToken721 _token) external view returns (uint256);

  function projects() external view returns (IJBProjects);

  function unclaimedBalanceOf(address _holder, uint256 _projectId) external view returns (uint256);

  function unclaimedTotalSupplyOf(uint256 _projectId) external view returns (uint256);

  function totalSupplyOf(uint256 _projectId) external view returns (uint256);

  function balanceOf(address _holder, uint256 _projectId) external view returns (uint256 _result);

  function requireClaimFor(uint256 _projectId) external view returns (bool);

  function issueFor(
    uint256 _projectId,
    string calldata _name,
    string calldata _symbol,
    string calldata _baseUri,
    IJBToken721UriResolver _tokenUriResolverAddress,
    IJBTokenContractUriResolver _contractUriResolverAddress
  ) external returns (IJBToken721 token);

  function changeFor(
    uint256 _projectId,
    IJBToken721 _token,
    address _newOwner
  ) external returns (IJBToken721 oldToken);

  function burnFrom(
    address _holder,
    uint256 _projectId,
    uint256 _tokenId,
    uint256 _amount,
    bool _preferClaimedTokens
  ) external;

  function mintFor(
    address _holder,
    uint256 _projectId,
    bool _preferClaimedTokens
  ) external;

  function shouldRequireClaimingFor(uint256 _projectId, bool _flag) external;

  function claimFor(
    address _holder,
    uint256 _projectId,
    uint256 _tokenId
  ) external;

  function transferFrom(
    address _holder,
    uint256 _projectId,
    address _recipient,
    uint256 _tokenId
  ) external;
}
