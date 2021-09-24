// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';

import './IJBTokenStore.sol';
import './IJBProjects.sol';
import './IJBSplitsStore.sol';
import './IJBTerminal.sol';
import './IJBOperatorStore.sol';
import './IJBFundingCycleDataSource.sol';
import './IJBPrices.sol';
import './IJBController.sol';

import './../structs/JBFundingCycleData.sol';
import './../structs/JBFundingCycleMetadata.sol';
import './../structs/JBOverflowAllowance.sol';

interface IJBControllerV1 {
  event SetOverflowAllowance(
    uint256 indexed projectId,
    uint256 indexed configuration,
    JBOverflowAllowance allowance,
    address caller
  );
  event DistributeReservedTokens(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    address indexed beneficiary,
    uint256 count,
    uint256 projectOwnerTokenCount,
    string memo,
    address caller
  );

  event DistributeToReservedTokenSplit(
    uint256 indexed fundingCycleId,
    uint256 indexed projectId,
    JBSplit split,
    uint256 tokenCount,
    address caller
  );

  event MintTokens(
    address indexed beneficiary,
    uint256 indexed projectId,
    uint256 indexed count,
    string memo,
    bool shouldReserveTokens,
    address caller
  );

  event BurnTokens(
    address indexed holder,
    uint256 indexed projectId,
    uint256 count,
    string memo,
    address caller
  );

  event Migrate(uint256 indexed projectId, IJBController to, address caller);

  function projects() external view returns (IJBProjects);

  function fundingCycleStore() external view returns (IJBFundingCycleStore);

  function tokenStore() external view returns (IJBTokenStore);

  function splitsStore() external view returns (IJBSplitsStore);

  function directory() external view returns (IJBDirectory);

  function fee() external view returns (uint256);

  function launchProjectFor(
    bytes32 _handle,
    string calldata _uri,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBOverflowAllowance[] memory _overflowAllowance,
    JBSplit[] memory _payoutSplits,
    JBSplit[] memory _reservedTokenSplits,
    IJBTerminal _terminal
  ) external;

  function reconfigureFundingCyclesOf(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    JBFundingCycleMetadata calldata _metadata,
    JBOverflowAllowance[] memory _overflowAllowance,
    JBSplit[] memory _payoutSplits,
    JBSplit[] memory _reservedTokenSplits
  ) external returns (uint256);

  function distributeReservedTokensOf(uint256 _projectId, string memory _memo)
    external
    returns (uint256 amount);

  function migrate(uint256 _projectId, IJBController _to) external;
}
