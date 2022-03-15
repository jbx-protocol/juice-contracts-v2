// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';

import './JBProjectPayer.sol';

/** 
  @notice 
  A contract that sends an ERC20 to a Juicebox project.
*/
abstract contract JBERC20ProjectPayer is JBProjectPayer {
  address public token;

  constructor(
    IERC20 _token,
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
    token = address(_token);
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
    address _from,
    address payable _to,
    uint256 _amount
  ) internal override {
    _from == address(this)
      ? IERC20(token).transfer(_to, _amount)
      : IERC20(token).transferFrom(_from, _to, _amount);
  }

  function _beforeTransferTo(address _to, uint256 _amount) internal override {
    IERC20(token).approve(_to, _amount);
  }
}
