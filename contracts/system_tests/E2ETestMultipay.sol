// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// Run on a fork (--rpc-url MAINNET_RPC)
import './helpers/hevm.sol';
import '../../lib/ds-test/src/test.sol';

import '../interfaces/IJBPaymentTerminal.sol';
import '../interfaces/IJBTokenStore.sol';
import '../Multipay.sol';

/**
  @dev run this test suite against a forked chain: forge test --rpc-url MY_RPC --match-contract TestMultipay
*/
contract TestMultipay is DSTest {

  IJBPaymentTerminal jbTerminal = IJBPaymentTerminal(0x7Ae63FBa045Fec7CaE1a75cF7Aa14183483b8397);
  IJBTokenStore tokenStore = IJBTokenStore(0xCBB8e16d998161AdB20465830107ca298995f371);

  uint256[] projectIds = [4, 4, 3, 3, 3];
  uint256[] amounts = [50000000000000000, 50600000000000000, 80000000000000000, 200000000000000000, 8000000000000000];
  address[] beneficiaries = [0xCF2a6c431a7a302c1DeF53174f2582bFd3979e88, 0xC655ab8D19138239F7397787a55B0CCeEFd73Fd7,
  0xa638E44Da7702b11588f90a0a14b7667937E252f, 0x30670D81E487c80b9EDc54370e6EaF943B6EAB39, 0xF6633b9d1278006d69B71b479D0D553562883494];
  string[] memos = ['', 'Let\'s Get Juicy!', '', '', 'w img 1'];

  Multipay multipay;

  Hevm public evm = Hevm(HEVM_ADDRESS);

  function setUp() public {
    multipay = new Multipay(jbTerminal);
  }

  function testComputeTotalEthToSend() public {
    uint256 toSend = multipay.computeTotalEthToSend(projectIds, beneficiaries, amounts, memos, projectIds);

    uint256 amount;
    for(uint i; i<amounts.length; i++) amount += amounts[i];
    amount += projectIds.length * 0.2 ether;

    assertEq(toSend, amount);
  }

  function testProcess() public {
    uint256 toSend = multipay.computeTotalEthToSend(projectIds, beneficiaries, amounts, memos, projectIds);

    multipay.process{value: toSend}(projectIds, beneficiaries, amounts, memos, projectIds);

    // Sanity check: did we received project token (assuming no project has a 0 weight)
    for(uint256 i; i < beneficiaries.length; ++i)
      assertGt(tokenStore.balanceOf(beneficiaries[i], projectIds[i]), 0);
  }

}