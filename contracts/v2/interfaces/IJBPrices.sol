// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol';

interface IJBPrices {
  event AddFeed(
    uint256 indexed currency,
    uint256 indexed base,
    uint256 decimals,
    AggregatorV3Interface feed
  );

  function TARGET_DECIMALS() external returns (uint256);

  function feedDecimalAdjusterFor(uint256 _currency, uint256 _base) external returns (uint256);

  function feedFor(uint256 _currency, uint256 _base) external returns (AggregatorV3Interface);

  function priceFor(uint256 _currency, uint256 _base) external view returns (uint256);

  function addFeedFor(
    uint256 _currency,
    uint256 _base,
    AggregatorV3Interface _priceFeed
  ) external;
}
