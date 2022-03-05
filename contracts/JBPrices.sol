// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';

import './interfaces/IJBPrices.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error PRICE_FEED_ALREADY_EXISTS();
error PRICE_FEED_NOT_FOUND();

/** 
  @notice Manages and normalizes price feeds.
*/
contract JBPrices is IJBPrices, Ownable {
  //*********************************************************************//
  // ---------------- public constant stored properties ---------------- //
  //*********************************************************************//

  /** 
    @notice 
    The normalized number of decimals each price feed has.
  */
  uint256 public constant override TARGET_DECIMALS = 18;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The available price feeds.

    _currency he currency of the feed.
    _base he base of the feed. 
  */
  mapping(uint256 => mapping(uint256 => IJBPriceFeed)) public override feedFor;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /** 
    @notice 
    Gets the current price of the provided currency in terms of the provided base currency.
    
    @param _currency The currency to get a price for.
    @param _base The currency to base the price on.
    
    @return The price of the currency in terms of the base, with 18 decimals.
  */
  function priceFor(uint256 _currency, uint256 _base) external view override returns (uint256) {
    // If the currency is the base, return 1 since they are priced the same.
    if (_currency == _base) return 10**TARGET_DECIMALS;

    // Get a reference to the feed.
    IJBPriceFeed _feed = feedFor[_currency][_base];

    // Feed must exist.
    if (_feed == IJBPriceFeed(address(0))) {
      revert PRICE_FEED_NOT_FOUND();
    }

    // Get the price.
    return _feed.getPrice(TARGET_DECIMALS);
  }

  //*********************************************************************//
  // ---------------------------- constructor -------------------------- //
  //*********************************************************************//

  /** 
    @param _owner The address that will own the contract.
  */
  constructor(address _owner) {
    // Transfer the ownership.
    transferOwnership(_owner);
  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /** 
    @notice 
    Add a price feed for a currency in terms of the provided base currency.

    @dev
    Current feeds can't be modified.

    @param _currency The currency that the price feed is for.
    @param _base The currency that the price feed is based on.
    @param _feed The price feed being added.
  */
  function addFeedFor(
    uint256 _currency,
    uint256 _base,
    IJBPriceFeed _feed
  ) external override onlyOwner {
    // There can't already be a feed for the specified currency.
    if (feedFor[_currency][_base] != IJBPriceFeed(address(0))) revert PRICE_FEED_ALREADY_EXISTS();

    // Set the feed.
    feedFor[_currency][_base] = _feed;

    emit AddFeed(_currency, _base, _feed);
  }
}
