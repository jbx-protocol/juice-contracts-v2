// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../interfaces/IJBPriceFeed.sol';


contract MockPriceFeed is IJBPriceFeed {

  uint256 public fakePrice;

  constructor(uint256 _fakePrice) {
    fakePrice = _fakePrice;
  }

  function getPrice(uint256 _decimals) external view override returns(uint256 _quote) {
    return (fakePrice * _decimals);
  }
}
