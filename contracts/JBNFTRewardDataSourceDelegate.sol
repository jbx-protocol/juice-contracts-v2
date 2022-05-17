// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import {ERC721 as ERC721Rari} from '@rari-capital/solmate/src/tokens/ERC721.sol';

import './interfaces/IJBDirectory.sol';
import './interfaces/IJBFundingCycleDataSource.sol';
import './interfaces/IJBNFTRewardDataSourceDelegate.sol';
import './interfaces/IJBPayDelegate.sol';
import './interfaces/IJBRedemptionDelegate.sol';
import './interfaces/IJBToken721UriResolver.sol';

import './structs/JBDidPayData.sol';
import './structs/JBDidRedeemData.sol';
import './structs/JBRedeemParamsData.sol';
import './structs/JBTokenAmount.sol';

/**
  @notice
  Manages a project's non-fungible reward's token (NFTs) to contributors by a contribution or distribution supply amount.

  @dev
  Adheres to -
  IJBNFTRewardDataSourceDelegate: General interface for the methods in this contract to react to treasury contributions or project token redemptions.

  @dev
  Inherits from -
  ERC721Rari: General token standard for non-fungible token accounting and creating.
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
  IJBNFTRewardDataSourceDelegate: General interface for the methods in this contract that interact with the JBNFTRewardDataSource.
  IJBFundingCycleDataSource: General interface for the methods in this contract to interact with JBPayParamsData and JBRedeemParamsData.
  IJBPayDelegate: General interface for the methods in this contract that interact with JBDidPayData.
  IJBRedemptionDelegate: General interface for the methods in this contract that interact with JBDidRedeemData.
*/
contract JBNFTRewardDataSourceDelegate is
  ERC721Rari,
  Ownable,
  IJBNFTRewardDataSourceDelegate,
  IJBFundingCycleDataSource,
  IJBPayDelegate,
  IJBRedemptionDelegate
{
  using Strings for uint256;

  //*********************************************************************//
  // --------------------------- custom errors ------------------------- //
  //*********************************************************************//
  error INVALID_PAYMENT_EVENT();
  error INCORRECT_OWNER();
  error INVALID_ADDRESS();
  error INVALID_TOKEN();
  error SUPPLY_EXHAUSTED();

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /**
    @notice
    Project id of the project this configuration is associated with.
  */
  uint256 private _projectId;

  /**
    @notice
    Parent controller.
  */
  IJBDirectory private _directory;

  /**
    @notice
    Minimum contribution amount to trigger NFT distribution, denominated in some currency defined as part of this object.
  */
  JBTokenAmount private _minContribution;

  /**
    @notice
    NFT mint cap as part of this configuration.
  */
  uint256 private _maxSupply;

  /**
    @notice
    Amount of NFTs minted thus far.
  */
  uint256 private _distributedSupply;

  /**
    @notice
    Next token id to be minted.
  */
  uint256 private _nextTokenId;

  /**
    @notice
    Current supply.
  */
  uint256 private _supply;

  /**
    @notice
    Token base uri.
  */
  string private _baseUri;

  /**
    @notice
    Custom token uri resolver, superceeds base uri.
  */
  IJBToken721UriResolver private _tokenUriResolver;

  /**
    @notice
    Contract Opensea-style metadata uri.  Learn more https://bit.ly/3NnBa9v.
  */
  string private _contractUri;

  /**
    @param projectId JBX project id this reward is associated with.
    @param directory JBX directory.
    @param maxSupply Total number of reward tokens to distribute.
    @param minContribution Minimum contribution amount to be eligible for this reward.
    @param _name The name of the token.
    @param _symbol The symbol that the token should be represented by.
    @param _uri Token base URI.
    @param _tokenUriResolverAddress Custom uri resolver.
    @param _contractMetadataUri Opensea-style contract metadata uri. 
    @param _admin Set an alternate owner.
  */
  constructor(
    uint256 projectId,
    IJBDirectory directory,
    uint256 maxSupply,
    JBTokenAmount memory minContribution,
    string memory _name,
    string memory _symbol,
    string memory _uri,
    IJBToken721UriResolver _tokenUriResolverAddress,
    string memory _contractMetadataUri,
    address _admin
  ) ERC721Rari(_name, _symbol) {
    // JBX
    _projectId = projectId;
    _directory = directory;
    _maxSupply = maxSupply;
    _minContribution = minContribution;

    // ERC721
    _baseUri = _uri;
    _tokenUriResolver = _tokenUriResolverAddress;
    _contractUri = _contractMetadataUri;

    if (_admin != address(0)) _transferOwnership(_admin);
  }

  //*********************************************************************//
  // ------------------- IJBFundingCycleDataSource --------------------- //
  //*********************************************************************//

  function payParams(JBPayParamsData calldata _data) 
    external 
    view 
    override 
    returns (uint256 weight, string memory memo, IJBPayDelegate delegate) 
  {
    return (0, _data.memo, IJBPayDelegate(address(this)));
  }

  function redeemParams(JBRedeemParamsData calldata _data)
    external
    pure
    override
    returns (uint256 reclaimAmount, string memory memo, IJBRedemptionDelegate delegate)
  {
    return (0, _data.memo, IJBRedemptionDelegate(address(0)));
  }

  //*********************************************************************//
  // ------------------------ IJBPayDelegate --------------------------- //
  //*********************************************************************//

  function didPay(JBDidPayData calldata _data) 
    external 
    override 
  {
    if (!_directory.isTerminalOf(_projectId, IJBPaymentTerminal(msg.sender))) revert INVALID_PAYMENT_EVENT();

    if (_distributedSupply == _maxSupply) return;    

    if (
      _data.amount.value >= _minContribution.value &&
      _data.amount.currency == _minContribution.currency
    ) {
      
      _mint(_data.beneficiary, _nextTokenId);

      ++_supply;
      ++_nextTokenId;

      ++_distributedSupply;
    }
  }

  //*********************************************************************//
  // -------------------- IJBRedemptionDelegate ------------------------ //
  //*********************************************************************//

  function didRedeem(JBDidRedeemData calldata _data) external override {
    // not a supported workflow for NFTs
  }

  //*********************************************************************//
  // ---------------------------- IERC165 ------------------------------ //
  //*********************************************************************//

  function supportsInterface(bytes4 _interfaceId)
    public
    pure
    override(ERC721Rari, IERC165)
    returns (bool)
  {
    return
      _interfaceId == type(IJBFundingCycleDataSource).interfaceId ||
      _interfaceId == type(IJBPayDelegate).interfaceId ||
      _interfaceId == type(IJBRedemptionDelegate).interfaceId ||
      super.supportsInterface(_interfaceId); // check with rari-ERC721
  }

  //*********************************************************************//
  // ----------------------------- ERC721 ------------------------------ //
  //*********************************************************************//

  /**
    @notice
    The total supply of this ERC721.

    ignored: _projectId the ID of the project to which the token belongs. This is ignored.

    @return The total supply of this ERC721, as a fixed point number.
  */
  function totalSupply(uint256) external view override returns (uint256) {
    return _supply;
  }

  /**
    @notice
    Returns the full URI for the asset.
  */
  function tokenURI(uint256 tokenId) public view override returns (string memory) {
    if (ownerOf[tokenId] == address(0)) revert INVALID_TOKEN();

    if (address(_tokenUriResolver) != address(0)) return _tokenUriResolver.tokenURI(tokenId);

    return bytes(_baseUri).length > 0 ? string(abi.encodePacked(_baseUri, tokenId.toString())) : '';
  }

  /**
    @notice
    Returns the Opensea-style contract metadata uri. Learn more https://bit.ly/3NnBa9v.
  */
  function contractURI() public view override returns (string memory contractUri) {
    contractUri = _contractUri;
  }

  /**
    @notice
    Approves an account to spend tokens on the `msg.sender`s behalf.

    ignored: _projectId the ID of the project to which the token belongs. This is ignored.
    @param _spender The address that will be spending tokens on the `msg.sender`s behalf.
    @param _id NFT id to approve.
  */
  function approve(
    uint256,
    address _spender,
    uint256 _id
    ) external override 
  {
    approve(_spender, _id);
  }

  /**
    @notice
    Transfer tokens to an account.

    ignored: _projectId The ID of the project to which the token belongs. This is ignored.
    @param _to The destination address.
    @param _id NFT id to transfer.
  */
  function transfer(
    uint256,
    address _to,
    uint256 _id
    ) external override 
  {
    transferFrom(msg.sender, _to, _id);
  }

  /**
    @notice
    Transfer tokens between accounts.

    ignored: _projectId The ID of the project to which the token belongs. This is ignored.
    @param _from The originating address.
    @param _to The destination address.
    @param _id The amount of the transfer, as a fixed point number with 18 decimals.
  */
  function transferFrom(
    uint256,
    address _from,
    address _to,
    uint256 _id
    ) external override 
  {
    transferFrom(_from, _to, _id);
  }

  /**
    @notice
    Returns the number of tokens held by the given address.
   */
  function ownerBalance(address _account) 
    external 
    view 
    override 
    returns (uint256) 
  {
    if (_account == address(0)) revert INVALID_ADDRESS();

    return balanceOf[_account];
  }

  /**
    @notice
    Confirms that the given address owns the provided token.
   */
  function isOwner(address _account, uint256 _id) external view override returns (bool) {
    return ownerOf[_id] == _account;
  }

  function mint(address _account) external override onlyOwner returns (uint256 tokenId) {
    if (_distributedSupply == _maxSupply) revert SUPPLY_EXHAUSTED();

    tokenId = _nextTokenId;
    _mint(_account, tokenId);

    ++_supply;
    ++_nextTokenId;

    ++_distributedSupply;
  }

  /**
    @notice
    Owner-only function to burn an address' token.

    @param _account The address which owns the token to be burned.
    @param _tokenId The tokenId which will be burned..
   */
  function burn(address _account, uint256 _tokenId) external override onlyOwner {
    if (ownerOf[_tokenId] != _account) revert INCORRECT_OWNER();

    _burn(_tokenId);
  }

  /**
    @notice
    Owner-only function to set a contract metadata uri to contain opensea-style metadata.

    @param _contractMetadataUri New metadata uri.
  */
  function setContractUri(string calldata _contractMetadataUri) external override onlyOwner {
    _contractUri = _contractMetadataUri;
  }

  /**
    @notice
    Owner-only function to set a new token base uri.

    @param _uri New base uri.
  */
  function setTokenUri(string calldata _uri) external override onlyOwner {
    _baseUri = _uri;
  }

  /**
    @notice
    Owner-only function to set a token uri resolver. If set to address(0), value of baseUri will be used instead.

    @param _tokenUriResolverAddress New uri resolver contract.
  */
  function setTokenUriResolver(IJBToken721UriResolver _tokenUriResolverAddress)
    external
    override
    onlyOwner
  {
    _tokenUriResolver = _tokenUriResolverAddress;
  }
}
