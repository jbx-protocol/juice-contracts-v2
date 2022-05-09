// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBController.sol';
import './interfaces/IJBFundingCycleDataSource.sol';
import './interfaces/IJBPayDelegate.sol';
import './interfaces/IJBRedemptionDelegate.sol';
import './interfaces/IJBToken721.sol';

import './structs/JBDidPayData.sol';
import './structs/JBDidRedeemData.sol';
import './structs/JBTokenAmount.sol';

contract JBNFTRewardDataSourceDelegate is
  IJBFundingCycleDataSource,
  IJBPayDelegate,
  IJBRedemptionDelegate
{
  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  uint256 private _projectId;
  IJBController private _controller;
  IJBToken721 private _token;
  JBTokenAmount private _minContribution;
  uint256 private _maxSupply;
  uint256 private _distributedSupply;

  /**
    @param projectId JBX project id this reward is associated with.
    @param controller JBC controller.
    @param token ERC721 token to be used as the reward
    @param maxSupply Total number of reward tokens to distribute
    @param minContribution Minumum contribution amout to be eligible for this reward.
  */
  constructor(
    uint256 projectId,
    IJBController controller,
    IJBToken721 token,
    uint256 maxSupply,
    JBTokenAmount memory minContribution
  ) {
    _projectId = projectId;
    _controller = controller;
    _token = token;
    _maxSupply = maxSupply;
    _minContribution = minContribution;
  }

  function payParams(JBPayParamsData calldata _data)
    external
    view
    override
    returns (
      uint256 weight,
      string memory memo,
      IJBPayDelegate delegate
    )
  {
    return (0, _data.memo, IJBPayDelegate(address(this)));
  }

  function redeemParams(JBRedeemParamsData calldata)
    external
    view
    override
    returns (
      uint256 reclaimAmount,
      string memory memo,
      IJBRedemptionDelegate delegate
    )
  {
    return (0, '', IJBRedemptionDelegate(address(0)));
  }

  function didPay(JBDidPayData calldata _data) external override {
    // NOTE: JBToken721Store has onlyController(_projectId) on mintFor which will revert for incorrect sender.

    if (_distributedSupply == _maxSupply) {
      return;
    }

    if (
      _data.amount.value >= _minContribution.value &&
      _data.amount.currency == _minContribution.currency
    ) {
      _controller.mintTokens721Of(_projectId, _data.beneficiary, _data.memo);
    }
  }

  function didRedeem(JBDidRedeemData calldata _data) external override {
    // not a supported workflow for NFTs
  }

  function supportsInterface(bytes4 _interfaceId) external pure override returns (bool) {
    return
      _interfaceId == type(IJBFundingCycleDataSource).interfaceId ||
      _interfaceId == type(IJBPayDelegate).interfaceId ||
      _interfaceId == type(IJBRedemptionDelegate).interfaceId;
  }
}
