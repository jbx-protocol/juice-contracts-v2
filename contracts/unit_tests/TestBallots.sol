// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '../../lib/ds-test/src/test.sol';
import '../system_tests/helpers/hevm.sol';

import '../interfaces/IJBFundingCycleBallot.sol';
import '../JBReconfigurationBufferBallot.sol';

contract TestBallots is DSTest {
  Hevm public evm = Hevm(HEVM_ADDRESS);

  function setUp() public {}

  function test3daysDuration() public {
    JBReconfigurationBufferBallot ballot = new JBReconfigurationBufferBallot();
    assertEq(ballot.duration(), 3 days);
  }

  function test3daysStateOfApproved() public {
    JBReconfigurationBufferBallot ballot = new JBReconfigurationBufferBallot();
    uint256 _configured = block.timestamp;

    assertEq(uint256(ballot.stateOf(0, _configured)), uint256(JBBallotState.Active));
  }

  function test3daysStateOfActive() public {
    JBReconfigurationBufferBallot ballot = new JBReconfigurationBufferBallot();
    uint256 _configured = block.timestamp;

    evm.warp(block.timestamp + 3 days + 1);

    assertEq(uint256(ballot.stateOf(0, _configured)), uint256(JBBallotState.Approved));
  }

  function test7daysDuration() public {
    JBReconfigurationBufferBallot ballot = new JBReconfigurationBufferBallot();
    assertEq(ballot.duration(), 7 days);
  }

  function test7daysStateOfApproved() public {
    JBReconfigurationBufferBallot ballot = new JBReconfigurationBufferBallot();
    uint256 _configured = block.timestamp;

    assertEq(uint256(ballot.stateOf(0, _configured)), uint256(JBBallotState.Active));
  }

  function test7daysStateOfActive() public {
    JBReconfigurationBufferBallot ballot = new JBReconfigurationBufferBallot();
    uint256 _configured = block.timestamp;

    evm.warp(block.timestamp + 7 days + 1);

    assertEq(uint256(ballot.stateOf(0, _configured)), uint256(JBBallotState.Approved));
  }
}
