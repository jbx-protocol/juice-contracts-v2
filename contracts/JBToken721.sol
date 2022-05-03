// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@rari-capital/solmate/src/tokens/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/IJBToken721.sol';

/**
  @notice
  An ERC-721 token that can be used by a project in the `JBNFTStore`.

  @dev
  Adheres to -
  IJBToken721: Allows this contract to be used by projects in the JBNFTStore.

  @dev
  Inherits from -
  ERC721: Rari Capital implementation.
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
*/
contract JBToken721 is ERC721, IJBToken721, Ownable {
  //*********************************************************************//
  // --------------------------- custom errors ------------------------- //
  //*********************************************************************//
  error INCORRECT_OWNER();
  error INVALID_ADDRESS();

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
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

  //*********************************************************************//
  // -------------------------- public views --------------------------- //
  //*********************************************************************//

  /**
    @notice
    Returns the base URI for the asset.

    ignored: _id Token id is ignored
  */
  function tokenURI(uint256) public view override returns (string memory) {
    return _baseUri;
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  uint256 private _nextTokenId;
  uint256 private _supply;
  string private _baseUri;

  /**
    @param _name The name of the token.
    @param _symbol The symbol that the token should be represented by.
    @param _uri Token base URI.
  */
  constructor(
    string memory _name,
    string memory _symbol,
    string memory _uri
  ) ERC721(_name, _symbol) {
    _baseUri = _uri;
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Mints the next NFT id.

    @dev
    Only the owner of this contract cant mint more of it.

    ignored: _projectId The ID of the project to which the token belongs. This is ignored.
    @param _account The account to mint the tokens for.
  */
  function mint(uint256, address _account) external override onlyOwner returns (uint256) {
    uint256 tokenId = _nextTokenId;
    super._mint(_account, tokenId);

    _supply += 1;
    _nextTokenId += 1;

    return tokenId;
  }

  /**
    @notice
    Burn some outstanding tokens.

    @dev
    Only the owner of this contract cant burn some of its supply.

    ignored: _projectId The ID of the project to which the token belongs. This is ignored.
    @param _account The account to burn tokens from.
    @param _id The amount of tokens to burn, as a fixed point number with 18 decimals.
  */
  function burn(
    uint256,
    address _account,
    uint256 _id
  ) external override onlyOwner {
    if (ownerOf[_id] != _account) {
      revert INCORRECT_OWNER();
    }

    super._burn(_id);

    _supply -= 1;
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
    super.approve(_spender, _id);
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
    super.transferFrom(msg.sender, _to, _id);
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
    super.transferFrom(_from, _to, _id);
  }

  function ownerBalance(address _account) external view override returns (uint256) {
    if (_account == address(0)) {
      revert INVALID_ADDRESS();
    }

    return balanceOf[_account];
  }

  function isOwner(address _account, uint256 _id) external view override returns (bool) {
    return ownerOf[_id] == _account;
  }

  //*********************************************************************//
  // ------------------------ public transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice
    Transfer ownership of this contract to another address.

    @dev
    Only the owner of this contract can transfer it.

    ignored: _projectId The ID of the project to which the token belongs. This is ignored.
    @param _newOwner The new owner.
  */
  function transferOwnership(uint256, address _newOwner) public override onlyOwner {
    return super.transferOwnership(_newOwner);
  }
}
