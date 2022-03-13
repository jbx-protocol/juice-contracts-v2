// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol';
import './interfaces/IJBPriceFeed.sol';
import './libraries/JBFixedPointNumber.sol';

contract JBChainlinkPriceFeed is IJBPriceFeed {
  // A library that provides utility for fixed point numbers.
  using JBFixedPointNumber for uint256;

  AggregatorV3Interface public feed;

  constructor(AggregatorV3Interface _feed) {
    feed = _feed;
  }

  function getPrice(uint256 _targetDecimals) external view override returns (uint256) {
    // Get the latest round information. Only need the price is needed.
    (, int256 _price, , , ) = feed.latestRoundData();

    // Get a reference to the number of decimals the feed uses.
    uint256 _decimals = feed.decimals();

    // Return the price, adjusted to the target decimals.
    return uint256(_price).adjustDecimals(_decimals, _targetDecimals);
  }
}
