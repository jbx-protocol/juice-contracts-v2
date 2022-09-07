// SPDX-License-Identifier: MIT
pragma solidity >=0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestDelegates is TestBaseWorkflow {
  JBController controller;
  JBProjectMetadata _projectMetadata;
  JBFundingCycleData _data;
  JBFundingCycleMetadata _metadata;
  JBGroupedSplits[] _groupedSplits;
  JBFundAccessConstraints[] _fundAccessConstraints;
  IJBPaymentTerminal[] _terminals;
  JBTokenStore _tokenStore;

  address _projectOwner;
  address _beneficiary;
  address _datasource = address(bytes20(keccak256('datasource')));

  uint256 _projectId;

  uint256 WEIGHT = 1000 * 10**18;

  function setUp() public override {
    super.setUp();

    _projectOwner = multisig();

    _beneficiary = beneficiary();

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
      global: JBGlobalFundingCycleMetadata({allowSetTerminals: false, allowSetController: false}),
      reservedRate: 5000, //50%
      redemptionRate: 5000, //50%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: false,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useTotalOverflowForRedemptions: false,
      useDataSourceForPay: true,
      useDataSourceForRedeem: true,
      dataSource: _datasource
    });

    _terminals.push(jbETHPaymentTerminal());
    _projectId = controller.launchProjectFor(
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

  function testPayDelegates(uint128[] memory payDelegateAmounts) public {
    JBPayDelegateAllocation[] memory _allocations = new JBPayDelegateAllocation[](
      payDelegateAmounts.length
    );
    address _beneficiary = address(bytes20(keccak256('beneficiary')));
    uint256 _paySum;

    // Check that we are not going to overflow uint256 and calculate the total pay amount
    for (uint256 i = 0; i < payDelegateAmounts.length; i++) {
      evm.assume(type(uint256).max - _paySum > payDelegateAmounts[i]);
      _paySum += payDelegateAmounts[i];
    }

    // We can't do a pay without paying
    evm.assume(_paySum > 0);

    (JBFundingCycle memory fundingCycle, JBFundingCycleMetadata memory metadata) = controller
      .currentFundingCycleOf(_projectId);
    for (uint256 i = 0; i < payDelegateAmounts.length; i++) {
      address _delegateAddress = address(bytes20(keccak256(abi.encodePacked('PayDelegate', i))));

      _allocations[i] = JBPayDelegateAllocation(
        IJBPayDelegate(_delegateAddress),
        payDelegateAmounts[i]
      );

      bytes memory _metadata;
      JBDidPayData memory _data = JBDidPayData(
        _beneficiary,
        _projectId,
        fundingCycle.configuration,
        JBTokenAmount(
          JBTokens.ETH,
          _paySum,
          JBSingleTokenPaymentTerminal(address(_terminals[0])).decimals(),
          JBSingleTokenPaymentTerminal(address(_terminals[0])).currency()
        ),
        JBTokenAmount(
          JBTokens.ETH,
          _paySum,
          JBSingleTokenPaymentTerminal(address(_terminals[0])).decimals(),
          JBSingleTokenPaymentTerminal(address(_terminals[0])).currency()
        ),
        0,
        _beneficiary,
        false,
        '',
        _metadata
      );

      // Mock the delegate
      evm.mockCall(_delegateAddress, abi.encodeWithSelector(IJBPayDelegate.didPay.selector), '');

      // Assert that the delegate gets called with the expected value
      evm.expectCall(
        _delegateAddress,
        payDelegateAmounts[i],
        abi.encodeWithSelector(IJBPayDelegate.didPay.selector, _data)
      );

      // Expect an event to be emitted for every delegate
      evm.expectEmit(true, true, true, true);
      emit DelegateDidPay(
        IJBPayDelegate(_delegateAddress),
        _data,
        payDelegateAmounts[i],
        _beneficiary
      );
    }

    evm.mockCall(
      _datasource,
      abi.encodeWithSelector(IJBFundingCycleDataSource.payParams.selector),
      abi.encode(
        0, // weight
        '', // memo
        _allocations // allocations
      )
    );

    evm.deal(_beneficiary, _paySum);
    evm.prank(_beneficiary);
    _terminals[0].pay{value: _paySum}(
      _projectId,
      _paySum,
      address(0),
      _beneficiary,
      0,
      false,
      'Forge test',
      new bytes(0)
    );
  }

  event DelegateDidPay(
    IJBPayDelegate indexed delegate,
    JBDidPayData data,
    uint256 delegatedAmount,
    address caller
  );
}
