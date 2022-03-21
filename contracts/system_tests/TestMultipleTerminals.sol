// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';
import './helpers/TestBaseWorkflow.sol';
import './mock/MockPriceFeed.sol';

contract TestMultipleTerminals is TestBaseWorkflow {

  JBController controller;
  JBProjectMetadata _projectMetadata;
  JBFundingCycleData _data;
  JBFundingCycleMetadata _metadata;
  JBGroupedSplits[] _groupedSplits;
  JBFundAccessConstraints[] _fundAccessConstraints;

  IJBPaymentTerminal[] _terminals;
  JBERC20PaymentTerminal ERC20terminal;
  JBETHPaymentTerminal ETHterminal;

  JBTokenStore _tokenStore;
  address _projectOwner;

  uint256 FAKE_PRICE = 10;
  uint256 WEIGHT = 1000 * 10**18;
  uint256 projectId;

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

    ERC20terminal = new JBERC20PaymentTerminal(
      jbToken(),
      jbLibraries().USD(), // currency
      jbLibraries().ETH(), // base weight currency
      1, // JBSplitsGroupe
      jbOperatorStore(),
      jbProjects(),
      jbDirectory(),
      jbSplitsStore(),
      jbPrices(),
      jbPaymentTerminalStore(),
      multisig()
    );
    evm.label(address(ERC20terminal), 'JBERC20PaymentTerminalUSD');

    ETHterminal = jbETHPaymentTerminal();

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: ERC20terminal,
        distributionLimit: 10*10**18,
        overflowAllowance: 5*10**18,
        distributionLimitCurrency: jbLibraries().USD(),
        overflowAllowanceCurrency: jbLibraries().USD()
      })
    );

    _fundAccessConstraints.push(
      JBFundAccessConstraints({
        terminal: ETHterminal,
        distributionLimit: 10*10**18,
        overflowAllowance: 5*10**18,
        distributionLimitCurrency: jbLibraries().ETH(),
        overflowAllowanceCurrency: jbLibraries().ETH()
      })
    );

    _terminals.push(ERC20terminal);
    _terminals.push(ETHterminal);

    projectId = controller.launchProjectFor(
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

    evm.startPrank(_projectOwner); 

    MockPriceFeed _priceFeed = new MockPriceFeed(FAKE_PRICE);
    evm.label(address(_priceFeed), 'MockPrice Feed');

    jbPrices().addFeedFor(
      jbLibraries().USD(), // currency
      jbLibraries().ETH(), // base weight currency
      _priceFeed
    );

    jbPrices().addFeedFor(
      jbLibraries().ETH(), // currency
      jbLibraries().USD(), // base weight currency
      _priceFeed
    );

    evm.stopPrank();
  }

  function testMultipleTerminal() public {
    // Send some token to the caller, so he can play
    address caller = msg.sender;
    evm.label(caller, 'caller');
    evm.prank(_projectOwner);
    jbToken().transfer(caller, 20*10**18);
    evm.deal(caller, 20*10**18);
    evm.deal(_projectOwner, 20*10**18);

    // ---- Pay in token ----
    evm.startPrank(caller); // back to regular msg.sender (bug?)
    jbToken().approve(address(ERC20terminal), 20*10**18);
    //evm.prank(caller); // back to regular msg.sender (bug?)
    ERC20terminal.pay(20*10**18, projectId, msg.sender, 0, false, 'Forge test', new bytes(0));

    // verify: beneficiary should have a balance of JBTokens (divided by 2 -> reserved rate = 50%)
    // price feed will return FAKE_PRICE*18 (for curr usd/base eth); since it's an 18 decimal terminal (ie calling getPrice(18) )
    uint256 _callerTokenBalanceAfterPayERC20 = PRBMath.mulDiv( 20*10**18, (WEIGHT/2), 18*FAKE_PRICE);
    assertEq(_tokenStore.balanceOf(msg.sender, projectId), _callerTokenBalanceAfterPayERC20);

    // verify: balance in terminal should be up to date
    assertEq(jbPaymentTerminalStore().balanceOf(ERC20terminal, projectId), 20*10**18);

    // ---- Pay in ETH ----
    ETHterminal.pay{value: 20 ether}(20 ether, projectId, caller, 0, false, 'Forge test', new bytes(0)); // funding target met and 10 ETH are now in the overflow

     // verify: beneficiary should have a balance of JBTokens (divided by 2 -> reserved rate = 50%)
    uint256 _callerTokenBalanceAfterPayEth = PRBMath.mulDiv(20 ether, (WEIGHT / 10**18), 2);
    assertEq(_tokenStore.balanceOf(caller, projectId), _callerTokenBalanceAfterPayERC20 + _callerTokenBalanceAfterPayEth);

    // verify: ETH balance in terminal should be up to date
    assertEq(jbPaymentTerminalStore().balanceOf(ETHterminal, projectId), 20 ether);

    evm.stopPrank();

    // ---- Use allowance ----
    evm.startPrank(_projectOwner);
    ERC20terminal.useAllowanceOf(
      projectId,
      5*10**18, // 15*10**18 are left in this terminal with 5*10**18 in overflow
      jbLibraries().USD(), // Currency
      0, // Min wei out
      payable(caller), // Beneficiary
      'MEMO'
    );
    evm.stopPrank();

    // Caller get the allowance corresponding to 5wad - fees?
    assertEq(jbToken().balanceOf(caller), (5*10**18 * jbLibraries().MAX_FEE()) / ((ERC20terminal.fee() + jbLibraries().MAX_FEE())));

    // redeem eth from the overflow by the token holder:
    uint256 callerBalance = _tokenStore.balanceOf(caller, projectId);

    evm.prank(caller);
    // This terminal has 15token left with 5 in overflow, in usd
    // Global overflow left is 5usd + 10eth.
    // Caller balance comes from 20eth+20usd -> we'll redeem 10eth+5usd, in usd (which would empty the erc20 terminal)
    ERC20terminal.redeemTokensOf(
      caller,
      projectId,
      (5*10**18 / FAKE_PRICE + 10 ether) * (WEIGHT/10**18),
      0,
      payable(caller),
      'gimme my money back',
      new bytes(0)
    );

    // verify: beneficiary should have a balance of 0 JBTokens
    assertEq(_tokenStore.balanceOf(caller, projectId), 0);
    // eth balance
    // token balance
  }
}
