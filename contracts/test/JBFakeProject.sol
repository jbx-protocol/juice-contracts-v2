// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// Inheritance
import '../abstract/JBProject.sol';

/**
  @dev 
  Fake Juicebox project used for testing.
*/
contract JBFakeProject is JBProject {
  constructor(uint256 _projectId, IJBDirectory _directory) JBProject(_projectId, _directory) {}

  /**
    Exposes internal _fundTreasury utility.
   */
  function fundTreasury(
    uint256 _projectId,
    uint256 _amount,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token
  ) external {
    _fundTreasury(_projectId, _amount, _beneficiary, _memo, _preferClaimedTokens, _token);
  }
}
