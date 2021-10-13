// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

// import './IJBProjects.sol';
// import './IJBSplitsStore.sol';
// import './IJBFundingCycleStore.sol';
// import './IJBPayDelegate.sol';
// import './IJBTokenStore.sol';
// import './IJBPrices.sol';
// import './IJBRedemptionDelegate.sol';
// import './IJBController.sol';
import './IJBDirectory.sol';

interface IJBVault {
  function token() external view returns (address);

  function deposit(uint256 _projectId, uint256 _amount) external payable;

  function withdraw(
    uint256 _projectId,
    uint256 _amount,
    address payable _to
  ) external;
}
