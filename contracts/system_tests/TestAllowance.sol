// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestAllowance is TestBaseWorkflow {
  JBController controller;
  JBProjectMetadata _projectMetadata;
  JBFundingCycleData _data;
  JBFundingCycleMetadata _metadata;
  JBGroupedSplits[] _groupedSplits;
  JBFundAccessConstraints[] _fundAccessConstraints;
  IJBTerminal[] _terminals;
  address _projectOwner;

  function setUp() public override {
    super.setUp();

    _projectOwner = multisig();

    controller = jbController();

    _projectMetadata = JBProjectMetadata({content: 'myIPFSHash', domain: 1});

    _data = JBFundingCycleData({
      duration: 14,
      weight: 1000 * 10**18,
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

    _terminals.push(jbETHPaymentTerminal());
  }

  function testAllowance() public {
    JBETHPaymentTerminal terminal = jbETHPaymentTerminal();

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: jbETHPaymentTerminal(),
        distributionLimit: 10 ether,
        overflowAllowance: 5 ether,
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

    terminal.pay{value: 20 ether}(projectId, msg.sender, 0, false, 'Forge test', new bytes(0)); // funding target met and 10 ETH are now in the overflow

    // Discretionary use of overflow allowance by project owner (allowance = 5ETH)
    evm.prank(_projectOwner); // Prank only next call
    terminal.useAllowanceOf(
      projectId,
      5 ether,
      1, // Currency
      0, // Min wei out
      payable(msg.sender) // Beneficiary
    );

    // Distribute the funding target ETH -> no split then beneficiary is the project owner
    evm.prank(_projectOwner);
    terminal.distributePayoutsOf(
      projectId,
      10 ether,
      1, // Currency
      0, // Min wei out
      'Foundry payment' // Memo
    );

    // redeem the 5ETH left in the overflow by the token holder:
    evm.prank(msg.sender);
    terminal.redeemTokensOf(
      msg.sender,
      projectId,
      1,
      0,
      payable(msg.sender),
      'gimme my money back',
      new bytes(0)
    );
  }

  function testFuzzAllowance(uint248 ALLOWANCE, uint96 BALANCE) public {
    JBETHPaymentTerminal terminal = jbETHPaymentTerminal();

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: jbETHPaymentTerminal(),
        distributionLimit: 10 ether,
        overflowAllowance: ALLOWANCE,
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

    terminal.pay{value: BALANCE}(projectId, msg.sender, 0, false, 'Forge test', new bytes(0)); // funding target met and 10 ETH are now in the overflow

    evm.prank(_projectOwner); // Prank only next call
    if (ALLOWANCE > BALANCE)
      evm.expectRevert(abi.encodeWithSignature('INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE()'));
    terminal.useAllowanceOf(
      projectId,
      ALLOWANCE,
      1, // Currency
      0, // Min wei out
      payable(msg.sender) // Beneficiary
    );

    // Distribute the funding target ETH -> no split then beneficiary is the project owner
    evm.prank(_projectOwner);
    terminal.distributePayoutsOf(
      projectId,
      10 ether,
      1, // Currency
      0, // Min wei out
      'Foundry payment' // Memo
    );

    // redeem the 5ETH left in the overflow by the token holder:
    evm.prank(msg.sender);
    terminal.redeemTokensOf(
      msg.sender,
      projectId,
      1,
      0,
      payable(msg.sender),
      'gimme my money back',
      new bytes(0)
    );
  }

  function testFuzzTarget(uint248 TARGET, uint96 BALANCE) public {
    JBETHPaymentTerminal terminal = jbETHPaymentTerminal();

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: jbETHPaymentTerminal(),
        distributionLimit: TARGET,
        overflowAllowance: 5 ether,
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

    terminal.pay{value: BALANCE}(projectId, msg.sender, 0, false, 'Forge test', new bytes(0)); // funding target met and 10 ETH are now in the overflow

    evm.prank(_projectOwner); // Prank only next call
    if (TARGET > BALANCE)
      evm.expectRevert(abi.encodeWithSignature('INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE()'));
    terminal.useAllowanceOf(
      projectId,
      5 ether,
      1, // Currency
      0, // Min wei out
      payable(msg.sender) // Beneficiary
    );

    // Distribute the funding target ETH -> no split then beneficiary is the project owner
    evm.prank(_projectOwner);
    if (TARGET > BALANCE)
      evm.expectRevert(abi.encodeWithSignature('INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE()'));
    terminal.distributePayoutsOf(
      projectId,
      TARGET,
      1, // Currency
      0, // Min wei out
      'Foundry payment' // Memo
    );

    // redeem the 5ETH left in the overflow by the token holder:
    evm.prank(msg.sender);
    terminal.redeemTokensOf(
      msg.sender,
      projectId,
      1,
      0,
      payable(msg.sender),
      'gimme my money back',
      new bytes(0)
    );
  }
}
