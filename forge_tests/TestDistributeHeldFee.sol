// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './helpers/TestBaseWorkflow.sol';

contract TestDistributeHeldFee_Local is TestBaseWorkflow {
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
  uint256 private _targetInWei = 10 * 10**18;

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
      redemptionRate: 10000, //100%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: false,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: true,
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
        distributionLimit: _targetInWei, // 10 ETH target
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

  function testHeldFeeReimburse(
    uint256 payAmountInWei,
    uint16 fee,
    uint256 feeDiscount
  ) external {
    // Assuming we don't revert when distributing too much
    vm.assume(payAmountInWei <= _targetInWei);
    // Avoid rounding error
    vm.assume(payAmountInWei > 1);
    vm.assume(feeDiscount <= jbLibraries().MAX_FEE());
    vm.assume(fee <= 50_000_000); // fee cap
    address _userWallet = address(1234);

    vm.prank(multisig());
    _terminal.setFee(fee);

    IJBFeeGauge feeGauge = IJBFeeGauge(address(69696969));
    vm.etch(address(feeGauge), new bytes(0x1));
    vm.mockCall(
      address(feeGauge),
      abi.encodeWithSignature('currentDiscountFor(uint256)', _projectId),
      abi.encode(feeDiscount)
    );
    vm.prank(multisig());
    _terminal.setFeeGauge(feeGauge);

    uint256 discountedFee = fee - PRBMath.mulDiv(fee, feeDiscount, jbLibraries().MAX_FEE());

    // -- pay --
    _terminal.pay{value: payAmountInWei}(
      _projectId,
      payAmountInWei,
      address(0),
      /* _beneficiary */
      _userWallet,
      /* _minReturnedTokens */
      0,
      /* _preferClaimedTokens */
      false,
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

    // -- distribute --
    _terminal.distributePayoutsOf(
      _projectId,
      payAmountInWei,
      jbLibraries().ETH(),
      address(0), //token (unused)
      /*min out*/
      0,
      /*LFG*/
      'lfg'
    );

    // verify: should have held the fee
    if (fee > 0) {
      assertEq(_terminal.heldFeesOf(_projectId)[0].fee, _terminal.fee());
      assertEq(_terminal.heldFeesOf(_projectId)[0].feeDiscount, feeDiscount);
      assertEq(_terminal.heldFeesOf(_projectId)[0].amount, payAmountInWei);
    }

    // -- add to balance --
    // Will get the fee reimbursed:
    uint256 heldFee = payAmountInWei -
      PRBMath.mulDiv(
        payAmountInWei,
        jbLibraries().MAX_FEE(),
        discountedFee + jbLibraries().MAX_FEE()
      ); // no discount
    uint256 balanceBefore = jbPaymentTerminalStore().balanceOf(_terminal, _projectId);
    _terminal.addToBalanceOf{value: payAmountInWei}(
      _projectId,
      payAmountInWei,
      address(0),
      'thanks for all the fish',
      /* _delegateMetadata */
      new bytes(0)
    );

    // verify: project should get the fee back (plus the addToBalance amount)
    assertEq(
      jbPaymentTerminalStore().balanceOf(_terminal, _projectId),
      balanceBefore + heldFee + payAmountInWei
    );
  }

  function testFeeGetsHeldSpecialCase() public {
    uint256 feeDiscount = 0;
    uint256 fee = 50_000_000;
    uint256 payAmountInWei = 1000000000; // The same value as 100% in the split (makes it easy to leave `1` left over)

    JBSplit[] memory _jbSplits = new JBSplit[](1);
    _jbSplits[0] = JBSplit(
      false,
      false,
      1000000000 - 1, // We make it so there is exactly `1` left over (note: change the subtraction to be anything else than 1 for this test to pass)
      0,
      payable(address(5)),
      0,
      IJBSplitAllocator(address(0))
    );

    JBGroupedSplits[] memory _groupedSplitsLocal = new JBGroupedSplits[](1);

    _groupedSplitsLocal[0] = JBGroupedSplits(_terminal.payoutSplitsGroup(), _jbSplits);

    _projectId = _controller.launchProjectFor(
      _projectOwner,
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp,
      _groupedSplitsLocal,
      _fundAccessConstraints,
      _terminals,
      ''
    );

    address _userWallet = address(1234);
    vm.deal(_userWallet, payAmountInWei);
    vm.prank(multisig());
    _terminal.setFee(fee);

    IJBFeeGauge feeGauge = IJBFeeGauge(address(69696969));
    vm.etch(address(feeGauge), new bytes(0x1));
    vm.mockCall(
      address(feeGauge),
      abi.encodeWithSignature('currentDiscountFor(uint256)', _projectId),
      abi.encode(feeDiscount)
    );
    vm.prank(multisig());
    _terminal.setFeeGauge(feeGauge);

    // -- pay --
    _terminal.pay{value: payAmountInWei}(
      _projectId,
      payAmountInWei,
      address(0),
      /* _beneficiary */
      _userWallet,
      /* _minReturnedTokens */
      0,
      /* _preferClaimedTokens */
      false,
      /* _memo */
      'Take my money!',
      /* _delegateMetadata */
      new bytes(0)
    );

    // verify: ETH balance in terminal should be up to date
    uint256 _terminalBalanceInWei = payAmountInWei;
    assertEq(jbPaymentTerminalStore().balanceOf(_terminal, _projectId), _terminalBalanceInWei);

    // -- distribute --
    _terminal.distributePayoutsOf(
      _projectId,
      payAmountInWei,
      jbLibraries().ETH(),
      address(0), //token (unused)
      /*min out*/
      0,
      /*LFG*/
      'lfg'
    );

    // Verify that a fee was held
    assertEq(_terminal.heldFeesOf(_projectId).length, 1);

    // verify: should have held the fee
    assertEq(_terminal.heldFeesOf(_projectId)[0].fee, _terminal.fee());
    assertEq(_terminal.heldFeesOf(_projectId)[0].feeDiscount, feeDiscount);
    assertEq(_terminal.heldFeesOf(_projectId)[0].amount, payAmountInWei);
  }
}
