// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// import '@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol';
import './IJBPriceFeed.sol';

interface IJBPrices {
  event AddFeed(uint256 indexed currency, uint256 indexed base, IJBPriceFeed feed);

  // solhint-disable-next-line func-name-mixedcase
  function TARGET_DECIMALS() external returns (uint256);

  function feedFor(uint256 _currency, uint256 _base) external returns (IJBPriceFeed);

  function priceFor(uint256 _currency, uint256 _base) external view returns (uint256);

  function addFeedFor(
    uint256 _currency,
    uint256 _base,
    IJBPriceFeed _priceFeed
  ) external;
}
