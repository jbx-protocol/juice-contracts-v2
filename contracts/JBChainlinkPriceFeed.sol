// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol';
import './interfaces/IJBPriceFeed.sol';

contract JBChainlinkPriceFeed is IJBPriceFeed {
  AggregatorV3Interface public feed;

  constructor(AggregatorV3Interface _feed) {
    feed = _feed;
  }

  function getPrice(uint256 _targetDecimals) external view override returns (uint256) {
    // Get the latest round information. Only need the price is needed.
    (, int256 _price, , , ) = feed.latestRoundData();

    // Get a reference to the number of decimals the feed uses.
    uint256 _decimals = feed.decimals();

    // If decimals need adjusting, multiply or divide the price by the decimal adjuster to get the normalized result.
    if (_targetDecimals == _decimals) {
      return uint256(_price);
    } else if (_targetDecimals > _decimals) {
      return uint256(_price) * 10**(_targetDecimals - _decimals);
    } else {
      return uint256(_price) / 10**(_decimals - _targetDecimals);
    }
  }
}
