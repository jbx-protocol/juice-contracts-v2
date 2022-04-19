// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBPayDelegate.sol';
import './../structs/JBDidPayData.sol';

contract JBGenesisNFTPayDelegate is IJBPayDelegate {
  // IJBGenesisNFT public immutable genesisNft;

  // constructor (IJBGenesisNFT _genesisNFT) {
  //   genesisNFT = _genesisNFT;
  // }

  function didPay(JBDidPayData calldata _data) override external {
    // TODO: call mint from NFT contract
    // _data.amount contains pay amount
  }
}
