// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./IJBTokenStore.sol";
import "./IJBFundingCycleStore.sol";
import "./IJBProjects.sol";
import "./IJBSplitsStore.sol";
import "./IJBTerminal.sol";
import "./IJBOperatorStore.sol";
import "./IJBFundingCycleDataSource.sol";
import "./IJBPrices.sol";

struct FundingCycleMetadata {
    uint256 reservedRate;
    uint256 redemptionRate;
    uint256 ballotRedemptionRate;
    bool pausePay;
    bool pauseWithdraw;
    bool pauseRedeem;
    bool pauseMint;
    bool pauseBurn;
    bool useDataSourceForPay;
    bool useDataSourceForRedeem;
    IJBFundingCycleDataSource dataSource;
}

struct OverflowAllowance {
    IJBTerminal terminal;
    uint256 amount;
}

interface IJBController {
    event SetOverflowAllowance(
        uint256 indexed projectId,
        uint256 indexed configuration,
        OverflowAllowance allowance,
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
        Split split,
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

    function projects() external view returns (IJBProjects);

    function fundingCycleStore() external view returns (IJBFundingCycleStore);

    function tokenStore() external view returns (IJBTokenStore);

    function splitsStore() external view returns (IJBSplitsStore);

    function directory() external view returns (IJBDirectory);

    function fee() external view returns (uint256);

    function reservedTokenBalanceOf(uint256 _projectId, uint256 _reservedRate)
        external
        view
        returns (uint256);

    function overflowAllowanceOf(
        uint256 _projectId,
        uint256 _configuration,
        IJBTerminal _terminal
    ) external view returns (uint256);

    function launchProjectFor(
        bytes32 _handle,
        string calldata _uri,
        FundingCycleProperties calldata _properties,
        FundingCycleMetadata calldata _metadata,
        OverflowAllowance[] memory _overflowAllowance,
        Split[] memory _payoutSplits,
        Split[] memory _reservedTokenSplits,
        IJBTerminal _terminal
    ) external;

    function reconfigureFundingCyclesOf(
        uint256 _projectId,
        FundingCycleProperties calldata _properties,
        FundingCycleMetadata calldata _metadata,
        OverflowAllowance[] memory _overflowAllowance,
        Split[] memory _payoutSplits,
        Split[] memory _reservedTokenSplits
    ) external returns (uint256);

    function withdrawFrom(uint256 _projectId, uint256 _amount)
        external
        returns (FundingCycle memory);

    function mintTokensOf(
        uint256 _projectId,
        uint256 _tokenCount,
        address _beneficiary,
        string calldata _memo,
        bool _preferUnstakedTokens,
        bool _shouldReserveTokens
    ) external;

    function burnTokensOf(
        address _holder,
        uint256 _projectId,
        uint256 _tokenCount,
        string calldata _memo,
        bool _preferUnstakedTokens
    ) external;

    function distributeReservedTokensOf(uint256 _projectId, string memory _memo)
        external
        returns (uint256 amount);

    function swapTerminal(IJBTerminal _terminal) external;
}
