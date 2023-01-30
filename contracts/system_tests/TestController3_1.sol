// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;


import "../JBController3_1.sol";

import "../interfaces/IJBController.sol";
import "../interfaces/IJBMigratable.sol";
import "../interfaces/IJBOperatorStore.sol";
import "../interfaces/IJBPaymentTerminal.sol";
import "../interfaces/IJBProjects.sol";

import "../interfaces/IJBPayoutRedemptionPaymentTerminal.sol";

import "../libraries/JBTokens.sol";

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

    IJBOperatorStore operatorStore;
    IJBProjects projects;
    IJBDirectory directory;
    IJBFundingCycleStore fundingCycleStore;
    IJBTokenStore tokenStore;
    IJBSplitsStore splitsStore;

    JBProjectMetadata projectMetadata;
    JBFundingCycleData data;
    JBFundingCycleMetadata metadata;
    JBGroupedSplits[] groupedSplits; 
    JBFundAccessConstraints[] fundAccessConstraints;
    IJBPaymentTerminal[] terminals;

    uint256 projectId;
    address projectOwner;
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

        operatorStore = IJBOperatorStore(
            stdJson.readAddress(vm.readFile("./deployments/mainnet/JBOperatorStore.json"), "address")
        );

        projects = oldJbController.projects();
        directory = oldJbController.directory();
        fundingCycleStore = oldJbController.fundingCycleStore();
        tokenStore = oldJbController.tokenStore();
        splitsStore = oldJbController.splitsStore();

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

        projectOwner = msg.sender;
    }

  function testControllerMigrationLaunchProject() public {
    JBController3_1 jbController = new JBController3_1(
        operatorStore,
        projects,
        directory,
        fundingCycleStore,
        tokenStore,
        splitsStore
    );

    address protocolOwner = projects.ownerOf(1);

    // -- Migrate Juicebox controller --

    // Allow controller migration in the fc
    metadata.allowControllerMigration = true;
    vm.prank(protocolOwner);
    oldJbController.reconfigureFundingCyclesOf(
      1,
      data,
      metadata,
      0,
      groupedSplits,
      fundAccessConstraints,
      ''
    );

    // warp to the next funding cycle
    JBFundingCycle memory fundingCycle = fundingCycleStore.currentOf(1);
    vm.warp(fundingCycle.start + fundingCycle.duration);

    // Prepare the new controller
    jbController.prepForMigrationOf(1, address(oldJbController));
    
    // Migrate the project to the new controller
    vm.prank(protocolOwner);
    oldJbController.migrate(1, jbController);
  }

    // function testFuzzPayBurnRedeemFlow(
    //     bool payPreferClaimed, //false
    //     bool burnPreferClaimed, //false
    //     uint96 payAmountInWei, // 1
    //     uint256 burnTokenAmount, // 0
    //     uint256 redeemTokenAmount // 0
    // ) external {
    //     // issue an ERC-20 token for project
    //     evm.prank(_projectOwner);
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
    //         evm.expectRevert(abi.encodeWithSignature("NO_BURNABLE_TOKENS()"));
    //     } else if (burnTokenAmount > uint256(type(int256).max)) {
    //         evm.expectRevert("SafeCast: value doesn't fit in an int256");
    //     } else if (burnTokenAmount > _userTokenBalance) {
    //         evm.expectRevert(abi.encodeWithSignature("INSUFFICIENT_FUNDS()"));
    //     } else {
    //         _userTokenBalance = _userTokenBalance - burnTokenAmount;
    //     }

    //     evm.prank(_userWallet);
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
    //         evm.expectRevert(abi.encodeWithSignature("INSUFFICIENT_TOKENS()"));
    //     } else {
    //         _userTokenBalance = _userTokenBalance - redeemTokenAmount;
    //     }

    //     evm.prank(_userWallet);
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
