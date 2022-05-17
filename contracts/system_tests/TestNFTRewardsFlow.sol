// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';
import '../structs/JBTokenAmount.sol';
import '../libraries/JBCurrencies.sol';

contract TestNFTRewardsFlow is TestBaseWorkflow {
  JBController private _controller;
  JBDirectory private _directory;
  JBTokenStore private _tokenStore;

  JBProjectMetadata private _projectMetadata;
  JBFundingCycleData private _fundingCycleData;
  JBFundingCycleMetadata private _fundingCycleMetadata;
  JBGroupedSplits[] private _groupedSplits; // Default empty
  JBFundAccessConstraints[] private _fundAccessConstraints; // Default empty
  IJBPaymentTerminal[] private _terminals; // Default empty

  uint256 private _projectId = 1;
  address private _projectOwner;
  uint256 private _reservedRate = 5000;
  uint256 private _minEthContribution = 1 * 10**18;

  JBNFTRewardDataSourceDelegate private _jbNFTRewardDataSourceDelegate;

  function setUp() public override {
    super.setUp();

    _controller = jbController();
    _directory = jbDirectory();
    _tokenStore = jbTokenStore();

    _projectMetadata = JBProjectMetadata({content: 'myIPFSHash', domain: 1});

    _fundingCycleData = JBFundingCycleData({
      duration: 1,
      weight: 1000 * 10**18,
      discountRate: 450000000,
      ballot: IJBFundingCycleBallot(address(0))
    });

    _fundingCycleMetadata = JBFundingCycleMetadata({
      global: JBGlobalFundingCycleMetadata({allowSetTerminals: false, allowSetController: false}),
      reservedRate: _reservedRate,
      redemptionRate: 5000, //50%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: true,
      allowChangeToken: true,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useTotalOverflowForRedemptions: false,
      useDataSourceForPay: true,
      useDataSourceForRedeem: false,
      dataSource: address(0)
    });

    _projectOwner = multisig();

    _terminals.push(jbETHPaymentTerminal());

    _projectId = _controller.launchProjectFor(
      _projectOwner,
      _projectMetadata,
      _fundingCycleData,
      _fundingCycleMetadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      _terminals,
      ''
    );

    evm.prank(_projectOwner);
    _jbNFTRewardDataSourceDelegate = new JBNFTRewardDataSourceDelegate(
      _projectId,
      _directory,
      100,
      JBTokenAmount({
        token: address(0),
        value: _minEthContribution,
        decimals: 18,
        currency: JBCurrencies.ETH
      }),
      'Reward NFT',
      'RN',
      'ipfs://',
      IJBToken721UriResolver(address(0)),
      'ipfs://',
      address(0)
    );

    _fundingCycleData = JBFundingCycleData({
      duration: 60 * 60,
      weight: 1000 * 10**18,
      discountRate: 450000001,
      ballot: IJBFundingCycleBallot(address(0))
    });

    _fundingCycleMetadata = JBFundingCycleMetadata({
      global: JBGlobalFundingCycleMetadata({allowSetTerminals: false, allowSetController: false}),
      reservedRate: _reservedRate,
      redemptionRate: 5000, //50%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: true,
      allowChangeToken: true,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useTotalOverflowForRedemptions: false,
      useDataSourceForPay: true,
      useDataSourceForRedeem: false,
      dataSource: address(_jbNFTRewardDataSourceDelegate)
    });

    evm.warp(block.timestamp + 10000);

    evm.prank(_projectOwner);
    _controller.reconfigureFundingCyclesOf(
      _projectId,
      _fundingCycleData,
      _fundingCycleMetadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      ''
    );
  }

  function testNFTRewardMint(uint96 amount) public {
    _terminals[0].pay{value: amount}(
      _projectId,
      0,
      address(0),
      msg.sender,
      0,
      false,
      'Forge test',
      new bytes(0)
    );

    if (amount > _minEthContribution) {
      require(_jbNFTRewardDataSourceDelegate.ownerBalance(msg.sender) == 1);
      require(_jbNFTRewardDataSourceDelegate.isOwner(msg.sender, 0) == true);
    } else {
      require(_jbNFTRewardDataSourceDelegate.ownerBalance(msg.sender) == 0);
    }
  }

  function testAdminMint() public {
    evm.prank(_projectOwner);
    _jbNFTRewardDataSourceDelegate.mint(address(1));

    require(_jbNFTRewardDataSourceDelegate.ownerBalance(address(1)) == 1);
    require(_jbNFTRewardDataSourceDelegate.isOwner(address(1), 0) == true);
  }

  function testFailAdminMint() public {
    evm.prank(address(1));
    _jbNFTRewardDataSourceDelegate.mint(address(2));
  }
}
