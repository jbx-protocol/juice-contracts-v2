// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow_2.sol';
import '../enums/JBUseReservedRateOption.sol';

contract TestMintForReserved is TestBaseWorkflow_2 {
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

    _terminals.push(jbETHPaymentTerminal());
  }

  function testMintReservedRateOption(uint16 _reservedRate, uint8 __option) public {
    bool _reverted;
    uint256 _amount = 100E18;

    evm.assume(__option < 3);
    JBUseReservedRateOption _option = JBUseReservedRateOption(__option);

    JBETHPaymentTerminal terminal = jbETHPaymentTerminal();

    _metadata = JBFundingCycleMetadata({
      global: JBGlobalFundingCycleMetadata({allowSetTerminals: false, allowSetController: false}),
      reservedRate: _reservedRate,
      redemptionRate: 5000, //50%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: true,
      allowChangeToken: false,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useTotalOverflowForRedemptions: false,
      useDataSourceForPay: false,
      useDataSourceForRedeem: false,
      dataSource: address(0)
    });

    if (_reservedRate > jbLibraries().MAX_RESERVED_RATE()) {
      evm.expectRevert(JBController.INVALID_RESERVED_RATE.selector);
      _reverted = true;
    }

    uint256 _projectId = controller.launchProjectFor(
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
controller.reservedTokenBalanceOf(_projectId, _reservedRate);
    if(!_reverted) {
      evm.prank(_projectOwner);
      controller.mintTokensOf(_projectId, _amount, _beneficiary, 'Can smashing for a living', false, _option);

      // Don't use the reserved rate, user balance is the amount minted and none is reserved
      if(_option == JBUseReservedRateOption.No) {
        assertEq(_tokenStore.balanceOf(_beneficiary, _projectId), _amount);
        assertEq(controller.reservedTokenBalanceOf(_projectId, _reservedRate), 0);
      }

      // Use the reserved rate, user balance is the amount minus the reserved part
      if(_option == JBUseReservedRateOption.Yes) {
        uint256 _userTokenBalance = _reservedRate > 0
          ? _amount - (_amount * _reservedRate / jbLibraries().MAX_RESERVED_RATE())
          : _amount;

        assertEq(_tokenStore.balanceOf(_beneficiary, _projectId), _userTokenBalance);
        assertEq(controller.reservedTokenBalanceOf(_projectId, _reservedRate), _amount - _userTokenBalance);
      }

      // All the token are in reserve, user balance is 0
      if(_option == JBUseReservedRateOption.Only) {
        assertEq(_tokenStore.balanceOf(_beneficiary, _projectId), 0);
        

        // to fix: should be the part to make _reserved + nonReserved = 100%, and not nonReserved*rate as in:
        uint256 _reservedToken = _reservedRate > 0
          ? _amount * _reservedRate / jbLibraries().MAX_RESERVED_RATE()
          : 0;

        assertEq(controller.reservedTokenBalanceOf(_projectId, _reservedRate), _reservedToken);
      }
    }
  }
}
