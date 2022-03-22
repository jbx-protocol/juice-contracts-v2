// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestReconfigureProject is TestBaseWorkflow {
  JBController controller;
  JBProjectMetadata _projectMetadata;
  JBFundingCycleData _data;
  JBFundingCycleMetadata _metadata;
  JBGroupedSplits[] _groupedSplits; // Default empty
  JBFundAccessConstraints[] _fundAccessConstraints; // Default empty
  IJBPaymentTerminal[] _terminals; // Default empty

  function setUp() public override {
    super.setUp();

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
  }

  function testReconfigureProject() public {
    uint256 projectId = controller.launchProjectFor(
      multisig(),
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp, // _mustStartAtOrAfter
      _groupedSplits,
      _fundAccessConstraints,
      _terminals,
      ''
    );

    JBFundingCycle memory fundingCycle = jbFundingCycleStore().currentOf(projectId); //, latestConfig);

    assertEq(fundingCycle.number, 1);
    assertEq(fundingCycle.weight, 1000 * 10**18);

    evm.prank(multisig());
    controller.reconfigureFundingCyclesOf(
      projectId,
      _data,
      _metadata,
      block.timestamp + 5,
      _groupedSplits,
      _fundAccessConstraints,
      ''
    );

    evm.warp(block.timestamp + 10);

    JBFundingCycle memory newFundingCycle = jbFundingCycleStore().currentOf(projectId); //, latestConfig);

    assertEq(newFundingCycle.number, 2);
  }

  function testReconfigureProjectFuzzRates(uint256 RESERVED_RATE, uint256 REDEMPTION_RATE) public {
    uint256 projectId = controller.launchProjectFor(
      multisig(),
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp, // _mustStartAtOrAfter
      _groupedSplits,
      _fundAccessConstraints,
      _terminals,
      ''
    );

    evm.prank(multisig());
    if(RESERVED_RATE > 10000)
      evm.expectRevert(abi.encodeWithSignature('INVALID_RESERVED_RATE()'));
    else if(REDEMPTION_RATE > 10000)
      evm.expectRevert(abi.encodeWithSignature('INVALID_REDEMPTION_RATE()'));

    controller.reconfigureFundingCyclesOf(
      projectId,
      _data,
      JBFundingCycleMetadata({
        reservedRate: RESERVED_RATE,
        redemptionRate: REDEMPTION_RATE,
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
      }),
      block.timestamp + 5,
      _groupedSplits,
      _fundAccessConstraints,
      ''
    );


  }
}
