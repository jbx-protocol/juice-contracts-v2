// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

/**
* This system test file verifies the following flow:
* launch project → issue token → change token → mint token → burn token
*/
contract TestTokenFlow is TestBaseWorkflow {
  JBController private _controller;
  JBTokenStore private _tokenStore;

  JBProjectMetadata private _projectMetadata;
  JBFundingCycleData private _data;
  JBFundingCycleMetadata private _metadata;
  JBGroupedSplits[] private _groupedSplits; // Default empty
  JBFundAccessConstraints[] private _fundAccessConstraints; // Default empty
  IJBTerminal[] private _terminals; // Default empty

  uint256 private _projectId;
  address private _projectOwner;
  uint256 private _reservedRate = 5000;

  function setUp() public override {
    super.setUp();

    _controller = jbController();
    _tokenStore = jbTokenStore();

    _projectMetadata = JBProjectMetadata({content: 'myIPFSHash', domain: 1});

    _data = JBFundingCycleData({
      duration: 14,
      weight: 1000 * 10**18,
      discountRate: 450000000,
      ballot: IJBFundingCycleBallot(address(0))
    });

    _metadata = JBFundingCycleMetadata({
      reservedRate: _reservedRate,
      redemptionRate: 5000,
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

  function testTokenFlow() public {
    // calls will originate from projectOwner addr
    evm.startPrank(_projectOwner);

    // issue an ERC-20 token for project
    _controller.issueTokenFor(_projectId, 'TestName', 'TestSymbol');

    // create a new IJBToken and change it's owner to the tokenStore
    IJBToken _newToken = new JBToken('NewTestName', 'NewTestSymbol');
    _newToken.transferOwnership(address(_tokenStore));

    // change the projects token to _newToken
    _controller.changeTokenOf(_projectId, _newToken, address(0));

    // confirm the project's new JBToken
    assertEq(address(_tokenStore.tokenOf(_projectId)), address(_newToken));

    // mint tokens to beneficiary addr
    address _beneficiary = address(1234);
    uint256 _tokenCount = 1000000;
    _controller.mintTokensOf(_projectId, _tokenCount, _beneficiary, /* _memo */ 'Mint memo', /* _preferClaimedTokens */ true, _reservedRate);

    // total token balance should be half of token count due to 50% reserved rate
    uint256 _balance = _tokenStore.balanceOf(_beneficiary, _projectId);
    assertEq(_balance, _tokenCount / 2);

    // burn tokens from beneficiary addr
    // next call will originate from holder addr
    evm.prank(_beneficiary);
    _controller.burnTokensOf(_beneficiary, _projectId, /* _tokenCount */ 1, /* _memo */ 'Burn memo', /* _preferClaimedTokens */ true);

    // total balance of tokens should be 1 less
    assertEq(_tokenStore.balanceOf(_beneficiary, _projectId), _balance - 1);
  }
}
