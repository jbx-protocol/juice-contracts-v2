// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './JBProjectPayer.sol';

/** 
  @notice 
  A contract that sends ETH to a Juicebox project.
*/
abstract contract JBETHProjectPayer is JBProjectPayer {
  constructor(
    uint256 _defaultProjectId,
    address payable _defaultBeneficiary,
    bool _defaultPreferClaimedTokens,
    string memory _defaultMemo,
    bytes memory _defaultMetadata,
    IJBDirectory _directory,
    address _owner
  )
    JBProjectPayer(
      _defaultProjectId,
      _defaultBeneficiary,
      _defaultPreferClaimedTokens,
      _defaultMemo,
      _defaultMetadata,
      _directory,
      _owner
    )
  // solhint-disable-next-line no-empty-blocks
  {

  }

  /** 
    Received funds go straight to the project.
  */
  receive() external payable virtual {
    _pay(
      defaultProjectId,
      JBTokens.ETH,
      address(this).balance,
      defaultBeneficiary == address(0) ? msg.sender : defaultBeneficiary,
      0, // Can't determine expectation of returned tokens ahead of time.
      defaultPreferClaimedTokens,
      defaultMemo,
      defaultMetadata
    );
  }

  function _transferFrom(
    address,
    address payable _to,
    uint256 _amount
  ) internal override {
    Address.sendValue(_to, _amount);
  }

  // solhint-disable-next-line no-empty-blocks
  function _beforeTransferTo(address _to, uint256 _amount) internal override {}
}
