// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../structs/JBGroupedSplits.sol';
import './IJBDirectory.sol';
import './IJBSplitsPayer.sol';
import './IJBSplitsStore.sol';

interface IJBETHERC20SplitsPayerDeployer {
  event DeploySplitsPayer(
    IJBSplitsPayer indexed splitsPayer,
    uint256 defaultSplitsProjectId,
    uint256 _defaultSplitsGroup,
    IJBSplitsStore _splitsStore,
    uint256 indexed defaultProjectId,
    address indexed defaultBeneficiary,
    bool defaultPreferClaimedTokens,
    string defaultMemo,
    bytes defaultMetadata,
    bool preferAddToBalance,
    IJBDirectory directory,
    address owner,
    address caller
  );

  function deploySplitsPayer(
    uint256 _defaultSplitsProjectId,
    uint256 _defaultSplitsGroup,
    IJBSplitsStore _splitsStore,
    uint256 _defaultProjectId,
    address payable _defaultBeneficiary,
    bool _defaultPreferClaimedTokens,
    string calldata _defaultMemo,
    bytes calldata _defaultMetadata,
    bool _preferAddToBalance,
    IJBDirectory _directory,
    address _owner
  ) external returns (IJBSplitsPayer splitsPayer);
}
