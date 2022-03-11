// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestERC20Terminal is TestBaseWorkflow {
  JBController controller;
  JBProjectMetadata _projectMetadata;
  JBFundingCycleData _data;
  JBFundingCycleMetadata _metadata;
  JBGroupedSplits[] _groupedSplits;
  JBFundAccessConstraints[] _fundAccessConstraints;
  IJBTerminal[] _terminals;
  JBTokenStore _tokenStore;
  address _projectOwner;

  uint256 WEIGHT = 1000 * 10**18;

  function setUp() public override {
    super.setUp();

    _projectOwner = multisig();

    _tokenStore = jbTokenStore();

    controller = jbController();

    _projectMetadata = JBProjectMetadata({content: 'myIPFSHash', domain: 1});

    _data = JBFundingCycleData({
      duration: 14,
      weight: WEIGHT,
      discountRate: 450000000,
      ballot: IJBFundingCycleBallot(address(0))
    });

    _metadata = JBFundingCycleMetadata({
      reservedRate: 5000,
      redemptionRate: 5000,
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseMint: false,
      pauseBurn: false,
      allowChangeToken: false,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useLocalBalanceForRedemptions: false,
      useDataSourceForPay: false,
      useDataSourceForRedeem: false,
      dataSource: IJBFundingCycleDataSource(address(0))
    });

    _terminals.push(jbERC20PaymentTerminal());
  }

  function testAllowance() public {
    JBERC20PaymentTerminal terminal = jbERC20PaymentTerminal();

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: jbERC20PaymentTerminal(),
        distributionLimit: 10*10**18,
        overflowAllowance: 5*10**18,
        distributionLimitCurrency: 1, // Currency = ETH
        overflowAllowanceCurrency: 1
      })
    );

    uint256 projectId = controller.launchProjectFor(
      _projectOwner,
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      _terminals
    );

    address caller = msg.sender;
    evm.label(caller, 'caller');
    evm.prank(_projectOwner);
    jbToken().transfer(caller, 20*10**18);

    evm.prank(caller); // back to regular msg.sender (bug?)
    jbToken().approve(address(terminal), 20*10**18);
    evm.prank(caller); // back to regular msg.sender (bug?)
    terminal.pay(20*10**18, projectId, msg.sender, 0, false, 'Forge test', new bytes(0)); // funding target met and 10 ETH are now in the overflow

     // verify: beneficiary should have a balance of JBTokens (divided by 2 -> reserved rate = 50%)
    uint256 _userTokenBalance = PRBMathUD60x18.mul(20*10**18, WEIGHT) / 2;
    assertEq(_tokenStore.balanceOf(msg.sender, projectId), _userTokenBalance);

    // verify: ETH balance in terminal should be up to date
    assertEq(terminal.balanceOf(projectId), 20*10**18);

    // Discretionary use of overflow allowance by project owner (allowance = 5ETH)
    evm.prank(_projectOwner); // Prank only next call
    terminal.useAllowanceOf(
      projectId,
      5*10**18,
      1, // Currency
      0, // Min wei out
      payable(msg.sender), // Beneficiary
      'MEMO'
    );
    assertEq((msg.sender).balance, 5*10**18);

    // Distribute the funding target ETH -> no split then beneficiary is the project owner
    evm.prank(_projectOwner);
    terminal.distributePayoutsOf(
      projectId,
      10*10**18,
      1, // Currency
      0, // Min wei out
      'Foundry payment' // Memo
    );
    assertEq(_projectOwner.balance, 10 ether);

    // redeem eth from the overflow by the token holder:
    uint256 senderBalance = _tokenStore.balanceOf(msg.sender, projectId);
    evm.prank(msg.sender);
    terminal.redeemTokensOf(
      msg.sender,
      projectId,
      senderBalance,
      0,
      payable(msg.sender),
      'gimme my money back',
      new bytes(0)
    );

    // verify: beneficiary should have a balance of 0 JBTokens
    assertEq(_tokenStore.balanceOf(msg.sender, projectId), 0);
  }

}
