// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../lib/ds-test/src/test.sol';
import '../system_tests/helpers/hevm.sol';

import '../interfaces/IJBFundingCycleBallot.sol';
import '../JBReconfigurationBufferBallot.sol';

contract TestBallots is DSTest {
  Hevm public evm = Hevm(HEVM_ADDRESS);

  JBReconfigurationBufferBallot ballot;

  address mockJbFundingCycleStore;

  function setUp() public {
    evm.etch(mockJbFundingCycleStore, new bytes(0x1));
    ballot = new JBReconfigurationBufferBallot(3 days, IJBFundingCycleStore(mockJbFundingCycleStore));
  }

  function test3daysDuration() public {
    assertEq(ballot.duration(), 3 days);
  }

  function test3daysStateOfApproved() public {
    uint256 _configured = block.timestamp;

    //assertEq(uint256(ballot.stateOf(0, _configured)), uint256(JBBallotState.Active));
  }

  function test3daysStateOfActive() public {
    uint256 _configured = block.timestamp;

    evm.warp(block.timestamp + 3 days + 1);

    //assertEq(uint256(ballot.stateOf(0, _configured, _configured)), uint256(JBBallotState.Approved));
  }
}
