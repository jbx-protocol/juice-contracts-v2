// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import './IJBOperatorStore.sol';

interface IJBOperatable is IERC165 {
  function operatorStore() external view returns (IJBOperatorStore);
}
