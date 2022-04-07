// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './helpers/TestBaseWorkflow.sol';

contract TestDistributeHeldFee is TestBaseWorkflow {
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
      reservedRate: 0,
      redemptionRate: 10000, //100%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: false,
      allowChangeToken: false,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      allowSetTerminals: false,
      allowSetController: false,
      holdFees: true,
      useTotalOverflowForRedemptions: false,
      useDataSourceForPay: false,
      useDataSourceForRedeem: false,
      dataSource: IJBFundingCycleDataSource(address(0))
    });

    _terminals.push(_terminal);

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: _terminal,
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

  function testHeldFeeReimburse(uint256 payAmountInWei) external {
    // Assuming we don't revert when distributing too much and there is a fee taken (ie no pay with 0 eth)
    evm.assume(payAmountInWei <= _targetInWei && payAmountInWei > 0);

    address _userWallet = address(1234);

    // -- pay --
    _terminal.pay{value: payAmountInWei}(
      payAmountInWei,
      _projectId,
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
    // Held fee is true in FC
    _terminal.distributePayoutsOf(_projectId, payAmountInWei, 1, 0, 'lfg');

    // verify: should have held the fee (and no discount)    
    assertEq(_terminal.heldFeesOf(_projectId)[0].fee, _terminal.fee());
    assertEq(_terminal.heldFeesOf(_projectId)[0].feeDiscount, 0);
    assertEq(_terminal.heldFeesOf(_projectId)[0].amount, payAmountInWei);

    // -- add to balance --
    // Will get the fee reimbursed:
    uint256 heldFee = payAmountInWei - PRBMath.mulDiv(payAmountInWei, jbLibraries().MAX_FEE(), _terminal.fee()+jbLibraries().MAX_FEE()); // no discount
    uint256 balanceBefore = jbPaymentTerminalStore().balanceOf(_terminal, _projectId);
    _terminal.addToBalanceOf{value: payAmountInWei}(_projectId, payAmountInWei, 'thanks for all the fish');
    
    // verify: project should get the fee back (plus the addToBalance amount)
    assertEq(jbPaymentTerminalStore().balanceOf(_terminal, _projectId), balanceBefore + heldFee + payAmountInWei);
  }
}
