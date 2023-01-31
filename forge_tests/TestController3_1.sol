// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import "@juicebox/JBController3_1.sol";

import "@juicebox/interfaces/IJBController.sol";
import "@juicebox/interfaces/IJBMigratable.sol";
import "@juicebox/interfaces/IJBOperatorStore.sol";
import "@juicebox/interfaces/IJBPaymentTerminal.sol";
import "@juicebox/interfaces/IJBSingleTokenPaymentTerminalStore.sol";
import "@juicebox/interfaces/IJBProjects.sol";

import "@juicebox/interfaces/IJBPayoutRedemptionPaymentTerminal.sol";

import "@juicebox/libraries/JBTokens.sol";

import "@paulrberg/contracts/math/PRBMath.sol";
import "@paulrberg/contracts/math/PRBMathUD60x18.sol";

import "forge-std/Test.sol";

/**
 * This system test file verifies the following flow:
 * launch project → issue token → pay project (claimed tokens) →  burn some of the claimed tokens → redeem rest of tokens → distribute reserved tokens
 *
 */
contract TestController31_Fork is Test {
    IJBPayoutRedemptionPaymentTerminal jbEthTerminal;
    IJBSingleTokenPaymentTerminalStore jbTerminalStore;
    IJBController oldJbController;

    IJBOperatorStore jbOperatorStore;
    IJBProjects jbProjects;
    IJBDirectory jbDirectory;
    IJBFundingCycleStore jbFundingCycleStore;
    IJBTokenStore jbTokenStore;
    IJBSplitsStore jbSplitsStore;

    JBProjectMetadata projectMetadata;
    JBFundingCycleData data;
    JBFundingCycleMetadata metadata;
    JBGroupedSplits[] groupedSplits;
    JBFundAccessConstraints[] fundAccessConstraints;
    IJBPaymentTerminal[] terminals;

    uint256 weight = 1 * 10 ** 18;
    uint256 targetInWei = 10 * 10 ** 18;

    function setUp() public {
        vm.createSelectFork("https://rpc.ankr.com/eth"); // Will start on latest block by default

        // Collect the mainnet deployment addresses
        jbEthTerminal = IJBPayoutRedemptionPaymentTerminal(
            stdJson.readAddress(vm.readFile("./deployments/mainnet/JBETHPaymentTerminal.json"), "address")
        );

        oldJbController =
            IJBController(stdJson.readAddress(vm.readFile("./deployments/mainnet/JBController.json"), "address"));

        jbOperatorStore =
            IJBOperatorStore(stdJson.readAddress(vm.readFile("./deployments/mainnet/JBOperatorStore.json"), "address"));

        jbProjects = oldJbController.projects();
        jbDirectory = oldJbController.directory();
        jbFundingCycleStore = oldJbController.fundingCycleStore();
        jbTokenStore = oldJbController.tokenStore();
        jbSplitsStore = oldJbController.splitsStore();
        jbTerminalStore = jbEthTerminal.store();

        projectMetadata = JBProjectMetadata({content: "myIPFSHash", domain: 1});

        data = JBFundingCycleData({
            duration: 14,
            weight: weight,
            discountRate: 450000000,
            ballot: IJBFundingCycleBallot(address(0))
        });

        metadata = JBFundingCycleMetadata({
            global: JBGlobalFundingCycleMetadata({
                allowSetTerminals: false,
                allowSetController: false,
                pauseTransfers: false
            }),
            reservedRate: 0,
            redemptionRate: 10000, //100%
            ballotRedemptionRate: 0,
            pausePay: false,
            pauseDistributions: false,
            pauseRedeem: false,
            pauseBurn: false,
            allowMinting: false,
            allowTerminalMigration: false,
            allowControllerMigration: false,
            holdFees: false,
            preferClaimedTokenOverride: false,
            useTotalOverflowForRedemptions: false,
            useDataSourceForPay: false,
            useDataSourceForRedeem: false,
            dataSource: address(0),
            metadata: 0
        });

        terminals.push(jbEthTerminal);

        fundAccessConstraints.push(
            JBFundAccessConstraints({
                terminal: jbEthTerminal,
                token: JBTokens.ETH,
                distributionLimit: targetInWei, // 10 ETH target
                overflowAllowance: 5 ether,
                distributionLimitCurrency: 1, // Currency = ETH
                overflowAllowanceCurrency: 1
            })
        );
    }

    function testController31_Migration_migrateAnyExistingProject(uint8 _projectId) public {
        // Migrate only existing projects
        vm.assume(_projectId <= jbProjects.count() && _projectId > 0);

        // Migrate only project which are not archived/have a controller
        vm.assume(jbDirectory.controllerOf(_projectId) != address(0));

        JBController3_1 jbController = migrate(_projectId);

        assertEq(jbDirectory.controllerOf(_projectId), address(jbController));
    }

    // TODO: add a reserved beneficiaries list and check their balance
    function testController31_Migration_distributeReservedTokenBeforeMigrating() external {
        address _projectOwner = makeAddr("_projectOwner");
        address _userWallet = makeAddr("_userWallet");

        uint256 _reservedRate = 4000; // 40%

        // Create a project with a reserved rate to insure the project has undistributed reserved tokens
        metadata.reservedRate = _reservedRate;
        uint256 _projectId = oldJbController.launchProjectFor(
            _projectOwner,
            projectMetadata,
            data,
            metadata,
            block.timestamp,
            groupedSplits,
            fundAccessConstraints,
            terminals,
            ""
        );

        vm.warp(block.timestamp + 1);

        // Pay the project, 40% are reserved
        uint256 payAmountInWei = 10 ether;
        jbEthTerminal.pay{value: payAmountInWei}(
            _projectId,
            payAmountInWei,
            address(0),
            _userWallet,
            /* _minReturnedTokens */
            0,
            /* _preferClaimedTokens */
            false,
            /* _memo */
            "Take my money!",
            /* _delegateMetadata */
            new bytes(0)
        );

        // Weight is 1-1, so the reserved tokens are 40% of the gross pay amount
        assertEq(oldJbController.reservedTokenBalanceOf(_projectId, _reservedRate), payAmountInWei * _reservedRate / JBConstants.MAX_RESERVED_RATE);

        JBController3_1 jbController = migrate(_projectId);

        assertEq(oldJbController.reservedTokenBalanceOf(_projectId, _reservedRate), 0);
        assertEq(jbController.reservedTokenBalanceOf(_projectId), 0);
    }

    function testController31_Migration_tracksReservedTokenInNewController() external {
        // JBController3_1 jbController = migrate(1);
    }

    function migrate(uint256 _projectId) internal returns (JBController3_1 jbController) {
        jbController = new JBController3_1(
            jbOperatorStore,
            jbProjects,
            jbDirectory,
            jbFundingCycleStore,
            jbTokenStore,
            jbSplitsStore
        );

        address protocolOwner = jbProjects.ownerOf(_projectId);

        // -- Migrate Juicebox controller --

        // Allow controller migration in the fc
        metadata.allowControllerMigration = true;
        vm.prank(protocolOwner);
        oldJbController.reconfigureFundingCyclesOf(
            _projectId, data, metadata, 0, groupedSplits, fundAccessConstraints, ""
        );

        // warp to the next funding cycle
        JBFundingCycle memory fundingCycle = jbFundingCycleStore.currentOf(_projectId);
        vm.warp(fundingCycle.start + fundingCycle.duration);

        // Migrate the project to the new controller (no prepForMigration needed anymore)
        vm.prank(protocolOwner);
        oldJbController.migrate(_projectId, jbController);
    }
}
