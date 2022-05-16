// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/Strings.sol';
import {ERC721 as ERC721Rari} from '@rari-capital/solmate/src/tokens/ERC721.sol';

import './interfaces/IJBController/1.sol';
import './interfaces/IJBFundingCycleDataSource.sol';
import './interfaces/IJBNFTRewardDataSourceDelegate.sol';
import './interfaces/IJBPayDelegate.sol';
import './interfaces/IJBRedemptionDelegate.sol';
import './interfaces/IJBToken721.sol';

import './structs/JBDidPayData.sol';
import './structs/JBDidRedeemData.sol';
import './structs/JBRedeemParamsData.sol';
import './structs/JBTokenAmount.sol';

contract JBNFTRewardDataSourceDelegate is
  ERC721Rari,
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
  IJBController private _controller;

  /**
    @notice
    NFT contract to mint against
  */
  IJBToken721 private _token;

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
    Contract opensea-style metadata uri.
  */
  string private _contractUri;

  /**
    @param projectId JBX project id this reward is associated with.
    @param controller JBC controller.
    @param token ERC721 token to be used as the reward
    @param maxSupply Total number of reward tokens to distribute
    @param minContribution Minimum contribution amount to be eligible for this reward.
    @param _name The name of the token.
    @param _symbol The symbol that the token should be represented by.
    @param _uri Token base URI.
    @param _tokenUriResolverAddress Custom uri resolver.
    @param _contractMetadataUri Contract metadata uri.
  */
  constructor(
    uint256 projectId,
    IJBController controller,
    IJBToken721 token,
    uint256 maxSupply,
    JBTokenAmount memory minContribution,
    string memory _name,
    string memory _symbol,
    string memory _uri,
    IJBToken721UriResolver _tokenUriResolverAddress,
    string memory _contractMetadataUri
  ) ERC721Rari(_name, _symbol) {
    // JBX
    _projectId = projectId;
    _controller = controller;
    _token = token;
    _maxSupply = maxSupply;
    _minContribution = minContribution;

    // ERC721
    _baseUri = _uri;
    _tokenUriResolver = _tokenUriResolverAddress;
    _contractUri = _contractMetadataUri;
  }

  //*********************************************************************//
  // ------------------- IJBFundingCycleDataSource --------------------- //
  //*********************************************************************//

  function payParams(JBPayParamsData calldata _data)
    external
    view
    override
    returns (
      uint256 weight,
      string memory memo,
      IJBPayDelegate delegate
    )
  {
    return (0, _data.memo, IJBPayDelegate(address(this)));
  }

  function redeemParams(JBRedeemParamsData calldata _data)
    external
    pure
    override
    returns (
      uint256 reclaimAmount,
      string memory memo,
      IJBRedemptionDelegate delegate
    )
  {
    return (0, _data.memo, IJBRedemptionDelegate(address(0)));
  }

  //*********************************************************************//
  // ------------------------ IJBPayDelegate --------------------------- //
  //*********************************************************************//

  function didPay(JBDidPayData calldata _data) external override {
    if (!_controller.directory().isTerminalOf(_projectId, IJBPaymentTerminal(msg.sender))) {
      revert INVALID_PAYMENT_EVENT();
    }

    if (_distributedSupply == _maxSupply) {
      return;
    }

    if (
      _data.amount.value >= _minContribution.value &&
      _data.amount.currency == _minContribution.currency
    ) {
      uint256 tokenId = _nextTokenId;
      _mint(_data.beneficiary, tokenId);

      _supply += 1;
      _nextTokenId += 1;

      _distributedSupply++;
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
    if (ownerOf[tokenId] == address(0)) {
      revert INVALID_TOKEN();
    }

    if (address(_tokenUriResolver) != address(0)) {
      return _tokenUriResolver.tokenURI(tokenId);
    }

    return bytes(_baseUri).length > 0 ? string(abi.encodePacked(_baseUri, tokenId.toString())) : '';
  }

  /**
    @notice
    Returns the contract metadata uri.
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
  ) external override {
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
  ) external override {
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
  ) external override {
    transferFrom(_from, _to, _id);
  }

  /**
    @notice
    Returns the number of tokens held by the given address.
   */
  function ownerBalance(address _account) external view override returns (uint256) {
    if (_account == address(0)) {
      revert INVALID_ADDRESS();
    }

    return balanceOf[_account];
  }

  /**
    @notice
    Confirms that the given address owns the provided token.
   */
  function isOwner(address _account, uint256 _id) external view override returns (bool) {
    return ownerOf[_id] == _account;
  }
}
