// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;


import "@juicebox/JBController3_1.sol";

import "@juicebox/interfaces/IJBController.sol";
import "@juicebox/interfaces/IJBMigratable.sol";
import "@juicebox/interfaces/IJBOperatorStore.sol";
import "@juicebox/interfaces/IJBPaymentTerminal.sol";
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
contract TestControllerV3_1_Fork is Test {
    IJBPayoutRedemptionPaymentTerminal jbEthTerminal;
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

    uint256 projectId;

    uint256 weight = 1000 * 10 ** 18;
    uint256 targetInWei = 10 * 10 ** 18;

    function setUp() public {
        vm.createSelectFork("https://rpc.ankr.com/eth"); // Will start on latest block by default

        // Collect the mainnet deployment addresses
        jbEthTerminal = IJBPayoutRedemptionPaymentTerminal(
            stdJson.readAddress(vm.readFile("./deployments/mainnet/JBETHPaymentTerminal.json"), "address")
        );

        oldJbController = IJBController(
            stdJson.readAddress(
                vm.readFile("./deployments/mainnet/JBController.json"),
                "address"
            )
        );

        jbOperatorStore = IJBOperatorStore(
            stdJson.readAddress(vm.readFile("./deployments/mainnet/JBOperatorStore.json"), "address")
        );

        jbProjects = oldJbController.projects();
        jbDirectory = oldJbController.directory();
        jbFundingCycleStore = oldJbController.fundingCycleStore();
        jbTokenStore = oldJbController.tokenStore();
        jbSplitsStore = oldJbController.splitsStore();

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

    function testController_Migration_v3toV31(uint8 _projectId) public {
        // Migrate only existing projects
        vm.assume(_projectId <= jbProjects.count() && _projectId > 0);

        // Migrate only project which are not archived/have a controller
        vm.assume(jbDirectory.controllerOf(_projectId) != address(0));

        JBController3_1 jbController = new JBController3_1(
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
        _projectId,
        data,
        metadata,
        0,
        groupedSplits,
        fundAccessConstraints,
        ''
        );

        // warp to the next funding cycle
        JBFundingCycle memory fundingCycle = jbFundingCycleStore.currentOf(_projectId);
        vm.warp(fundingCycle.start + fundingCycle.duration);

        // Prepare the new controller
        jbController.prepForMigrationOf(_projectId, address(oldJbController));
        
        // Migrate the project to the new controller
        vm.prank(protocolOwner);
        oldJbController.migrate(_projectId, jbController);

        assertEq(jbDirectory.controllerOf(_projectId), address(jbController));
    }

    // function testFuzzPayBurnRedeemFlow(
    //     bool payPreferClaimed, //false
    //     bool burnPreferClaimed, //false
    //     uint96 payAmountInWei, // 1
    //     uint256 burnTokenAmount, // 0
    //     uint256 redeemTokenAmount // 0
    // ) external {
    //     // issue an ERC-20 token for project
    //     vm.prank(_projectOwner);
    //     _tokenStore.issueFor(_projectId, "TestName", "TestSymbol");

    //     address _userWallet = address(1234);

    //     // pay terminal
    //     _terminal.pay{value: payAmountInWei}(
    //         _projectId,
    //         payAmountInWei,
    //         address(0),
    //         _userWallet,
    //         /* _minReturnedTokens */
    //         0,
    //         /* _preferClaimedTokens */
    //         payPreferClaimed,
    //         /* _memo */
    //         "Take my money!",
    //         /* _delegateMetadata */
    //         new bytes(0)
    //     );

    //     // verify: beneficiary should have a balance of JBTokens
    //     uint256 _userTokenBalance = PRBMathUD60x18.mul(payAmountInWei, _weight);
    //     assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _userTokenBalance);

    //     // verify: ETH balance in terminal should be up to date
    //     uint256 _terminalBalanceInWei = payAmountInWei;
    //     assertEq(jbPaymentTerminalStore().balanceOf(_terminal, _projectId), _terminalBalanceInWei);

    //     // burn tokens from beneficiary addr
    //     if (burnTokenAmount == 0) {
    //         vm.expectRevert(abi.encodeWithSignature("NO_BURNABLE_TOKENS()"));
    //     } else if (burnTokenAmount > uint256(type(int256).max)) {
    //         vm.expectRevert("SafeCast: value doesn't fit in an int256");
    //     } else if (burnTokenAmount > _userTokenBalance) {
    //         vm.expectRevert(abi.encodeWithSignature("INSUFFICIENT_FUNDS()"));
    //     } else {
    //         _userTokenBalance = _userTokenBalance - burnTokenAmount;
    //     }

    //     vm.prank(_userWallet);
    //     _controller.burnTokensOf(
    //         _userWallet,
    //         _projectId,
    //         /* _tokenCount */
    //         burnTokenAmount,
    //         /* _memo */
    //         "I hate tokens!",
    //         /* _preferClaimedTokens */
    //         burnPreferClaimed
    //     );

    //     // verify: beneficiary should have a new balance of JBTokens
    //     assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _userTokenBalance);

    //     // redeem tokens
    //     if (redeemTokenAmount > _userTokenBalance) {
    //         vm.expectRevert(abi.encodeWithSignature("INSUFFICIENT_TOKENS()"));
    //     } else {
    //         _userTokenBalance = _userTokenBalance - redeemTokenAmount;
    //     }

    //     vm.prank(_userWallet);
    //     uint256 _reclaimAmtInWei = _terminal.redeemTokensOf(
    //         /* _holder */
    //         _userWallet,
    //         /* _projectId */
    //         _projectId,
    //         /* _tokenCount */
    //         redeemTokenAmount,
    //         /* token (unused) */
    //         address(0),
    //         /* _minReturnedWei */
    //         0,
    //         /* _beneficiary */
    //         payable(_userWallet),
    //         /* _memo */
    //         "Refund me now!",
    //         /* _delegateMetadata */
    //         new bytes(0)
    //     );

    //     // verify: beneficiary should have a new balance of JBTokens
    //     assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _userTokenBalance);

    //     // verify: ETH balance in terminal should be up to date
    //     assertEq(jbPaymentTerminalStore().balanceOf(_terminal, _projectId), _terminalBalanceInWei - _reclaimAmtInWei);
    // }
}
