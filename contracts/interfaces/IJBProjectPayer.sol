// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './IJBDirectory.sol';

interface IJBProjectPayer {
  event SetDefaultValues(
    uint256 indexed projectId,
    address indexed beneficiary,
    bool preferClaimedTokens,
    string memo,
    bytes metadata,
    address caller
  );

  function directory() external view returns (IJBDirectory);

  function defaultProjectId() external view returns (uint256);

  function defaultBeneficiary() external view returns (address payable);

  function defaultPreferClaimedTokens() external view returns (bool);

  function defaultMemo() external view returns (string memory);

  function defaultMetadata() external view returns (bytes memory);

  function setDefaultValues(
    uint256 _projectId,
    address payable _beneficiary,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) external;

  function pay(
    uint256 _projectId,
    address _token,
    address _payer,
    uint256 _amount,
    uint256 _decimals,
    address _beneficiary,
    uint256 _minReturnedTokens,
    bool _preferClaimedTokens,
    string memory _memo,
    bytes memory _metadata
  ) external payable;

  receive() external payable;
}
