// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestLaunchProject is TestBaseWorkflow {
  JBController controller;
  JBProjectMetadata _projectMetadata;
  JBFundingCycleData _data;
  JBFundingCycleMetadata _metadata;
  JBFundAccessConstraints[] _fundAccessConstraints; // Default empty
  IJBTerminal[] _terminals; // Default empty

  // Testing constants -> todo: fuzz
  uint256 PROJECT_ID; // The id of the new project
  uint256 PROJECT_DOMAIN = 1; // The default domain used when launching
  uint256 DURATION = 10 days;
  uint256 WEIGHT = 1000 * 10**18;
  uint256 DISCOUNT_RATE = 500000000; // 50%
  
  IJBFundingCycleBallot BALLOT = IJBFundingCycleBallot(address(0));

  address payable constant BENEFICIARY = payable(address(69420));
  address constant TERMINAL_ADDRESS = address(42069);

  function setUp() public override {
    super.setUp();

    controller = jbController();

    _terminals.push(IJBTerminal(address(TERMINAL_ADDRESS)));

    _projectMetadata = JBProjectMetadata({content: 'myIPFSHash', domain: PROJECT_DOMAIN});

    _data = JBFundingCycleData({
      duration: DURATION,
      weight: WEIGHT,
      discountRate: DISCOUNT_RATE,
      ballot: BALLOT
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

/// @dev in setUp(), msg.sender is the address(0), while not in later tests -> insure
///      appropriate sender context.
  function launchProject() internal {
    JBSplit[] memory splitsArr = new JBSplit[](1);
    JBGroupedSplits[] memory _groupedSplits = new JBGroupedSplits[](1);

    splitsArr[0] =
      JBSplit({
              preferClaimed: true,
              percent: 250000000, //25%
              projectId: 0,
              beneficiary: BENEFICIARY,
              lockedUntil: 0,
              allocator: IJBSplitAllocator(address(0))
            });

    _groupedSplits[0] = 
      JBGroupedSplits({
        group: 0,
        splits: splitsArr
      })
    ;

    PROJECT_ID = controller.launchProjectFor(
      msg.sender,
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      _terminals
    );
  }

  function testOwnerOfNewProject() public {
    launchProject();
    assertEq(jbProjects().ownerOf(PROJECT_ID), msg.sender);
  }

  function testMetadataOfNewProject() public {
    launchProject();
    string memory storedProjectMetadata = jbProjects().metadataContentOf(PROJECT_ID, PROJECT_DOMAIN);
    assertEq(storedProjectMetadata, _projectMetadata.content);
  }

  function testGetFundingCycleAtCurrentTimestamp() public {
    launchProject();

    JBFundingCycle memory currentFundingCycle = JBFundingCycle({
      number: 1, // Starts at one for each project
      configuration: block.timestamp,
      basedOn: 0, // One before the current one
      start: block.timestamp,
      duration: DURATION,
      weight: WEIGHT,
      discountRate: DISCOUNT_RATE,
      ballot: BALLOT,
      metadata: JBFundingCycleMetadataResolver.packFundingCycleMetadata(_metadata)
    });

    JBFundingCycle memory storedFundingCycle = jbFundingCycleStore().get(PROJECT_ID, block.timestamp);

    assertEqFundingCycle(currentFundingCycle, storedFundingCycle);
  }

  function testGetCurrentFundingCycle() public {
    launchProject();

    JBFundingCycle memory currentFundingCycle = JBFundingCycle({
      number: 1, // Starts at one for each project
      configuration: block.timestamp,
      basedOn: 0, // One before the current one
      start: block.timestamp,
      duration: DURATION,
      weight: WEIGHT,
      discountRate: DISCOUNT_RATE,
      ballot: BALLOT,
      metadata: JBFundingCycleMetadataResolver.packFundingCycleMetadata(_metadata)
    });

    JBFundingCycle memory storedFundingCycle = jbFundingCycleStore().currentOf(PROJECT_ID);

    assertEqFundingCycle(currentFundingCycle, storedFundingCycle);
  }

  function testGetQueuedFundingCycle() public {
    launchProject();

    JBFundingCycle memory nextFundingCycle = JBFundingCycle({
      number: 2,
      configuration: block.timestamp,
      basedOn: 0,
      start: block.timestamp + DURATION,
      duration: DURATION,
      weight: WEIGHT * DISCOUNT_RATE / JBConstants.MAX_DISCOUNT_RATE,
      discountRate: DISCOUNT_RATE,
      ballot: BALLOT,
      metadata: JBFundingCycleMetadataResolver.packFundingCycleMetadata(_metadata)
    });

    JBFundingCycle memory storedFundingCycle = jbFundingCycleStore().queuedOf(PROJECT_ID);

    assertEqFundingCycle(nextFundingCycle, storedFundingCycle);
  }

  // Test for no queued if no duration set?

  function testGetSplits() public {
    // Avoid memory to storage array copy error
    JBSplit[] memory splitsArr = new JBSplit[](1);
    JBGroupedSplits[] memory _groupedSplits = new JBGroupedSplits[](1);

    splitsArr[0] =
      JBSplit({
              preferClaimed: true,
              percent: 250000000, //25%
              projectId: 0,
              beneficiary: BENEFICIARY,
              lockedUntil: 0,
              allocator: IJBSplitAllocator(address(0))
            });

    _groupedSplits[0] = 
      JBGroupedSplits({
        group: 0,
        splits: splitsArr
      })
    ;
    JBSplit[] memory currentSplits = jbSplitsStore().splitsOf(PROJECT_ID, PROJECT_DOMAIN, 0);

    for(uint256 i=0; i<currentSplits.length; i++) assertEqSplit(currentSplits[i], _groupedSplits[0].splits[i]);
  }

  function testGetFundAccessConstraints() public {
    // No constraint passed
    assertEq(controller.distributionLimitOf(PROJECT_ID, block.timestamp, _terminals[0]), 0);
  }

  function testGetDistributionLimitCurrency() public {
    assertEq(controller.distributionLimitCurrencyOf(PROJECT_ID, block.timestamp, _terminals[0]), 0);
  }
  function testGetOverflowAllowance() public {
    assertEq(controller.overflowAllowanceOf(PROJECT_ID, block.timestamp, _terminals[0]), 0);
  }
  function testGetOverflowCurrency() public {
    assertEq(controller.overflowAllowanceCurrencyOf(PROJECT_ID, block.timestamp, _terminals[0]), 0);
  }

  function testGetCurrentController() public {
    assertEq(address(jbDirectory().controllerOf(PROJECT_ID)), address(controller));
  }
}
