// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

/** 
  @notice 
  Explains how to mint NFTs (721 or 1155) based on contribution amount.

  @dev
  Contribution range should be interpreted inclusive of boundaries.

  @dev
  Since ERC721 tokens are generally minted sequentially the tokenIds array is expected to be ignored for those.

  @dev
  For ERC721 tokens the amounts array should contain a single value, this is the number of sequential tokens that the user would get for a contribution falling into the defined range.

  @dev
  For ERC1155 tokens the tokenIds list may contain more than one value. These would be the token ids issues to the contributor in the amounts in the matching array indices of the amounts array.
*/

/*
  @member contributionRangeStart Lowest contribution amount for this tier, inclusive.
  @member contributionRangeEnd Highest contribution amount for this tier, inclusive.
  @member contributionCurrency Currency of the contribution, should match existing constants from JBTokens.
  @member tokenIds List of token ids to distribute, relevant for ERC1155 contracts, ignored for ERC721.
  @member amounts List of token id amounts to distribute, relevant for ERC1155; for ERC721 should contain a single item.
*/
struct JBNFTTranche {
  uint256 contributionRangeStart;
  uint256 contributionRangeEnd;
  uint256 contributionCurrency;
  uint256[] tokenIds;
  uint256[] amounts;
}
