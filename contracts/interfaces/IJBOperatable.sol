// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import './IJBOperatorStore.sol';

interface IJBOperatable {
  function operatorStore() external view returns (IJBOperatorStore);
}
