// SPDX-License-Identifier: MIT
/* solhint-disable comprehensive-interface*/
pragma solidity 0.8.6;

// Inheritance
import '../abstract/JBProjectPayer.sol';

/**
  @dev 
  Fake Juicebox project used for testing.
*/
contract JBFakeProjectPayer is JBProjectPayer {
  // solhint-disable-next-line no-empty-blocks
  constructor(uint256 _projectId, IJBDirectory _directory) JBProjectPayer(_projectId, _directory) {}

  /**
    @dev
    Example API that calls internal _fundTreasury function. The example here is an NFT mint
    function that routes funds to a Juicebox project.
   */
  function mint(
    uint256 _projectId,
    uint256 _amount,
    address _beneficiary,
    string memory _memo,
    bool _preferClaimedTokens,
    address _token,
    bytes memory _metadata
  ) external payable {
    // Mint NFT, etc.
    // ...

    // Fund Juicebox treasury.
    _pay(_projectId, _amount, _beneficiary, _memo, _preferClaimedTokens, _token, _metadata);
  }
}
