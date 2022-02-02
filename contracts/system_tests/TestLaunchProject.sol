// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestLaunchProject is TestBaseWorkflow {
  function testLaunchProject() public {
    uint256 WEIGHT = 1000 * 10**18;

    JBController controller = jbController();

    JBProjectMetadata memory _projectMetadata = JBProjectMetadata({
      content: 'myIPFSHash',
      domain: 1
    });

    JBFundingCycleData memory _data = JBFundingCycleData({
      duration: 14,
      weight: WEIGHT,
      discountRate: 450000000,
      ballot: IJBFundingCycleBallot(address(0))
    });

    JBFundingCycleMetadata memory _metadata = JBFundingCycleMetadata({
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

    JBGroupedSplits[] memory _groupedSplits = new JBGroupedSplits[](0);

    JBFundAccessConstraints[] memory _fundAccessConstraints = new JBFundAccessConstraints[](0);

    IJBTerminal[] memory _terminals = new IJBTerminal[](0);

    uint256 projectId = controller.launchProjectFor(
      msg.sender,
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      _terminals
    );

    JBFundingCycle memory fundingCycle = jbFundingCycleStore().currentOf(projectId); //, latestConfig);

    assertEq(fundingCycle.number, 1);
    assertEq(fundingCycle.weight, WEIGHT);
  }

  function testLaunchProjectFuzzWeight(uint256 WEIGHT) public {
    JBController controller = jbController();

    JBProjectMetadata memory _projectMetadata = JBProjectMetadata({
      content: 'myIPFSHash',
      domain: 1
    });

    JBFundingCycleData memory _data = JBFundingCycleData({
      duration: 14,
      weight: WEIGHT,
      discountRate: 450000000,
      ballot: IJBFundingCycleBallot(address(0))
    });

    JBFundingCycleMetadata memory _metadata = JBFundingCycleMetadata({
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

    JBGroupedSplits[] memory _groupedSplits = new JBGroupedSplits[](0);

    JBFundAccessConstraints[] memory _fundAccessConstraints = new JBFundAccessConstraints[](0);

    IJBTerminal[] memory _terminals = new IJBTerminal[](0);

    // expectRevert on the next call if weight overflowing
    if (WEIGHT > type(uint88).max) {
      evm.expectRevert(abi.encodeWithSignature('INVALID_WEIGHT()'));

      uint256 projectId = controller.launchProjectFor(
        msg.sender,
        _projectMetadata,
        _data,
        _metadata,
        block.timestamp,
        _groupedSplits,
        _fundAccessConstraints,
        _terminals
      );
    } else {
      uint256 projectId = controller.launchProjectFor(
        msg.sender,
        _projectMetadata,
        _data,
        _metadata,
        block.timestamp,
        _groupedSplits,
        _fundAccessConstraints,
        _terminals
      );

      JBFundingCycle memory fundingCycle = jbFundingCycleStore().currentOf(projectId); //, latestConfig);

      assertEq(fundingCycle.number, 1);
      assertEq(fundingCycle.weight, WEIGHT);
    }
  }
}
