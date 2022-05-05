// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBFundingCycleDataSource.sol';
import './interfaces/IJBPayDelegate.sol';
import './interfaces/IJBRedemptionDelegate.sol';
import './interfaces/IJBToken721.sol';
import './interfaces/IJBToken721Store.sol';
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
  IJBToken721Store private _tokenStore;
  IJBToken721 private _token;
  JBTokenAmount private _minContribution;
  uint256 private _maxSupply;
  uint256 private _distributedSupply;

  /**
    @param projectId JBX project id this reward is associated with.
    @param tokenStore ERC721 token store that manages the reward NFT contract.
    @param token ERC721 token to be used as the reward
    @param maxSupply Total number of reward tokens to distribute
    @param minContribution Minumum contribution amout to be eligible for this reward.
  */
  constructor(
    uint256 projectId,
    IJBToken721Store tokenStore,
    IJBToken721 token,
    uint256 maxSupply,
    JBTokenAmount memory minContribution
  ) {
    _projectId = projectId;
    _tokenStore = tokenStore;
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
    return (0, '', IJBRedemptionDelegate(address(this)));
  }

  function didPay(JBDidPayData calldata _data) external override {
    if (_distributedSupply == _maxSupply) {
      return;
    }

    if (
      _data.amount.value >= _minContribution.value &&
      _data.amount.currency == _minContribution.currency
    ) {
      _tokenStore.mintFor(_data.payer, _projectId, _token);
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
