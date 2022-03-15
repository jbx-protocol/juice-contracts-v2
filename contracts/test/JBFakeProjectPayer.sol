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
  constructor(
    uint256 _defaultProjectId,
    address payable _defaultBeneficiary,
    bool _defaultPreferClaimedTokens,
    string memory _defaultMemo,
    bytes memory _defaultMetadata,
    IJBDirectory _directory,
    address _owner
  )
    JBProjectPayer(
      _defaultProjectId,
      _defaultBeneficiary,
      _defaultPreferClaimedTokens,
      _defaultMemo,
      _defaultMetadata,
      _directory,
      _owner
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  /**
    @dev
    Example API that calls internal _fundTreasury function. The example here is an NFT mint
    function that routes funds to a Juicebox project.
   */
  function mint(
    uint256 _projectId,
    address _token,
    uint256 _amount,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) external payable {
    // Mint NFT, etc.
    // ...

    // Fund Juicebox treasury.
    pay(
      _projectId,
      _token,
      _amount,
      _beneficiary,
      _minReturnedTokens,
      _preferClaimedTokens,
      _memo,
      _metadata
    );
  }
}
