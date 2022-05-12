// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';
import '../structs/JBTokenAmount.sol';
import '../libraries/JBCurrencies.sol';

/// @notice This file tests JBToken related flows
contract TestNFTRewardsFlow is TestBaseWorkflow {
  JBController private _controller;
  JBTokenStore private _tokenStore;
  JBToken721Store private _nftStore;

  JBProjectMetadata private _projectMetadata;
  JBFundingCycleData private _fundingCycleData;
  JBFundingCycleMetadata private _fundingCycleMetadata;
  JBGroupedSplits[] private _groupedSplits; // Default empty
  JBFundAccessConstraints[] private _fundAccessConstraints; // Default empty
  IJBPaymentTerminal[] private _terminals; // Default empty

  uint256 private _projectId = 1;
  address private _projectOwner;
  uint256 private _reservedRate = 5000;

  JBNFTRewardDataSourceDelegate private _jbNFTRewardDataSourceDelegate;
  IJBToken721 private _nft;

  function setUp() public override {
    super.setUp();

    _controller = jbController();
    _tokenStore = jbTokenStore();
    _nftStore = jbToken721Store();

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
    _nft = _controller.issueToken721For(
      _projectId,
      'NFT',
      'N',
      'ipfs://',
      IJBToken721UriResolver(address(0)),
      'ipfs://'
    );

    _jbNFTRewardDataSourceDelegate = new JBNFTRewardDataSourceDelegate(
      _projectId,
      _controller,
      _nft,
      100,
      JBTokenAmount({
        token: address(0),
        value: 1 * 10**18,
        decimals: 18,
        currency: JBCurrencies.ETH
      })
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

  function testNFTRewardMint() public {
    _terminals[0].pay{value: 2 * 10**18}(
      _projectId,
      0,
      address(0),
      msg.sender,
      0,
      false,
      'Forge test',
      new bytes(0)
    );

    require(_nft.ownerBalance(msg.sender) == 1);
    require(_nft.isOwner(msg.sender, 0) == true);
  }
}
