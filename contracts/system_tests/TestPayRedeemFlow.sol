// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMathUD60x18.sol';

import './helpers/TestBaseWorkflow.sol';

/**
* This system test file verifies the following flow:
* launch project → issue token → pay project (claimed tokens) →  burn some of the claimed tokens → redeem rest of tokens
*/
contract TestPayRedeemFlow is TestBaseWorkflow {
  JBController private _controller;
  JBETHPaymentTerminal private _terminal;
  JBTokenStore private _tokenStore;

  JBProjectMetadata private _projectMetadata;
  JBFundingCycleData private _data;
  JBFundingCycleMetadata private _metadata;
  JBGroupedSplits[] private _groupedSplits; // Default empty
  JBFundAccessConstraints[] private _fundAccessConstraints; // Default empty
  IJBTerminal[] private _terminals; // Default empty

  uint256 private _projectId;
  address private _projectOwner;
  uint256 private _reservedRate = 0;
  uint256 private _weight = 1000 * 10**18;

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
      reservedRate: _reservedRate,
      redemptionRate: 5000, // 50%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseMint: false,
      pauseBurn: false,
      allowChangeToken: true,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useLocalBalanceForRedemptions: false,
      useDataSourceForPay: false,
      useDataSourceForRedeem: false,
      dataSource: IJBFundingCycleDataSource(address(0))
    });

    _terminals.push(_terminal);

    _fundAccessConstraints.push(JBFundAccessConstraints({
        terminal: _terminal,
        distributionLimit: 10 ether,
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
      _terminals
    );

  }

  // fuzz candidates:
  // mint claimed/unclaimed, burn claimed/unclaimed, payment amount, burn amount, redeem amount

  function testPayRedeemFlow() public {
    // issue an ERC-20 token for project
    // next call from projectOwner addr
    evm.prank(_projectOwner);
    _controller.issueTokenFor(_projectId, 'TestName', 'TestSymbol');

    address _userWallet = address(1234);
    uint256 _paymentAmtInWei = 20*10**18;

    // pay terminal 20 ETH (20*10**18 wei)
    _terminal.pay{value: 20 ether}(
        _projectId,
        /* _beneficiary */ _userWallet,
        /* _minReturnedTokens */ 0,
        /* _preferClaimedTokens */ true,
        /* _memo */ 'pay you',
        /* _delegateMetadata */ new bytes(0)
      ); // funding target met and 10 ETH are now in the overflow

    // verify: beneficiary should have a balance of JBTokens
    uint256 _expectedUserBalance = PRBMathUD60x18.mul(_paymentAmtInWei, _weight);
    assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _expectedUserBalance);

    // verify: ETH balance in terminal should be up to date
    assertEq(_terminal.ethBalanceOf(_projectId), _paymentAmtInWei);

    // burn tokens from beneficiary addr
    // next call will originate from holder addr
    evm.prank(_userWallet);
    _controller.burnTokensOf(_userWallet, _projectId, /* _tokenCount */ 1, /* _memo */ 'Burn memo', /* _preferClaimedTokens */ true);

    // verify: beneficiary should have a new balance of JBTokens
    _expectedUserBalance = _expectedUserBalance - 1;
    assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _expectedUserBalance);

    // redeem tokens
    // next call from someAddr
    evm.prank(_userWallet);
    _terminal.redeemTokensOf(
      /* _holder */ _userWallet,
      /* _projectId */ _projectId,
      /* _tokenCount */ _expectedUserBalance,
      /* _minReturnedWei */ 0,
      /* _beneficiary */ payable(_userWallet),
      /* _memo */ 'pay me',
      /* _delegateMetadata */ new bytes(0)
    );

    // verify: beneficiary should have a new balance of JBTokens
    _expectedUserBalance = _expectedUserBalance - _expectedUserBalance;
    assertEq(_tokenStore.balanceOf(_userWallet, _projectId), _expectedUserBalance);

    // verify: ETH balance in terminal should be halved due to 50% redemption rate
    assertEq(_terminal.ethBalanceOf(_projectId), _paymentAmtInWei/2);
  }
}
