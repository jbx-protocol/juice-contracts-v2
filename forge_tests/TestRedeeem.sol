// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './helpers/TestBaseWorkflow.sol';

/**
 * This system test file verifies the following flow:
 * launch project → issue token → pay project (claimed tokens) →  burn some of the claimed tokens → redeem rest of tokens
 */
contract TestRedeem_Local is TestBaseWorkflow {
  JBController private _controller;
  JBETHPaymentTerminal private _terminal;
  JBTokenStore private _tokenStore;

  JBProjectMetadata private _projectMetadata;
  JBFundingCycleData private _data;
  JBFundingCycleMetadata private _metadata;
  JBGroupedSplits[] private _groupedSplits; // Default empty
  JBFundAccessConstraints[] private _fundAccessConstraints; // Default empty
  IJBPaymentTerminal[] private _terminals; // Default empty

  uint256 private _projectId;
  address private _projectOwner;
  uint256 private _weight = 1000 * 10**18;
  uint256 private _targetInWei = 1 * 10**18;

  function setUp() public override {
    super.setUp();

    _controller = jbController();
    _terminal = jbETHPaymentTerminal();
    _tokenStore = jbTokenStore();

    _projectMetadata = JBProjectMetadata({content: 'myIPFSHash', domain: 1});

    _data = JBFundingCycleData({
      duration: 14,
      weight: _weight,
      discountRate: 450000000,
      ballot: IJBFundingCycleBallot(address(0))
    });

    _metadata = JBFundingCycleMetadata({
      global: JBGlobalFundingCycleMetadata({
        allowSetTerminals: false,
        allowSetController: false,
        pauseTransfers: false
      }),
      reservedRate: 0,
      redemptionRate: 5000,
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

    _terminals.push(_terminal);

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: _terminal,
        token: jbLibraries().ETHToken(),
        distributionLimit: 1 ether, // 10 ETH target
        overflowAllowance: 5 ether,
        distributionLimitCurrency: 1, // Currency = ETH
        overflowAllowanceCurrency: 1
      })
    );

    _projectOwner = multisig();

    _projectId = _controller.launchProjectFor(
      _projectOwner,
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      _terminals,
      ''
    );
  }

  function testRedeem() external {
    bool payPreferClaimed = true; //false
    uint96 payAmountInWei = 2 ether;

    // issue an ERC-20 token for project
    vm.prank(_projectOwner);
    _tokenStore.issueFor(_projectId, 'TestName', 'TestSymbol');

    address _userWallet = address(1234);

    // pay terminal
    _terminal.pay{value: payAmountInWei}(
      _projectId,
      payAmountInWei,
      address(0),
      _userWallet,
      /* _minReturnedTokens */
      0,
      /* _preferClaimedTokens */
      payPreferClaimed,
      /* _memo */
      'Take my money!',
      /* _delegateMetadata */
      new bytes(0)
    );

    // verify: beneficiary should have a balance of JBTokens
    uint256 _userTokenBalance = PRBMathUD60x18.mul(payAmountInWei, _weight);
    assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _userTokenBalance);

    // verify: ETH balance in terminal should be up to date
    uint256 _terminalBalanceInWei = payAmountInWei;
    assertEq(jbPaymentTerminalStore().balanceOf(_terminal, _projectId), _terminalBalanceInWei);

    vm.prank(_userWallet);
    uint256 _reclaimAmtInWei = _terminal.redeemTokensOf(
      /* _holder */
      _userWallet,
      /* _projectId */
      _projectId,
      /* _tokenCount */
      _userTokenBalance / 2,
      /* token (unused) */
      address(0),
      /* _minReturnedWei */
      1,
      /* _beneficiary */
      payable(_userWallet),
      /* _memo */
      'Refund me now!',
      /* _delegateMetadata */
      new bytes(0)
    );

    // verify: beneficiary has correct amount ok token
    assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _userTokenBalance / 2);

    // verify: ETH balance in terminal should be up to date
    assertEq(
      jbPaymentTerminalStore().balanceOf(_terminal, _projectId),
      _terminalBalanceInWei - _reclaimAmtInWei
    );
  }
}
