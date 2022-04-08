// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBETHERC20SplitsPayerDeployer.sol';

import './JBETHERC20SplitsPayer.sol';

/** 
  @notice 
  Deploys splits payer contracts.

  @dev
  Adheres to:
  IJBETHERC20SplitsPayerDeployer:  General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.
*/
contract JBETHERC20SplitsPayerDeployer is IJBETHERC20SplitsPayerDeployer {
  /** 
    @notice 
    Allows anyone to deploy a new project payer contract.

    @param _groupedSplits A group of splits to share payments between.
    @param _splitsStore A contract that stores splits for each project.
    @param _defaultProjectId The ID of the project whose treasury should be forwarded the project payer contract's received payments.
    @param _defaultBeneficiary The address that'll receive the project's tokens when the project payer receives payments. 
    @param _defaultPreferClaimedTokens A flag indicating whether issued tokens from the project payer's received payments should be automatically claimed into the beneficiary's wallet. 
    @param _defaultMemo The memo that'll be forwarded with the project payer's received payments. 
    @param _defaultMetadata The metadata that'll be forwarded with the project payer's received payments. 
    @param _defaultPreferAddToBalance  A flag indicating if received payments should call the `pay` function or the `addToBalance` function of a project.
    @param _directory A contract storing directories of terminals and controllers for each project.
    @param _owner The address that will own the project payer.

    @return splitsPayer The splits payer contract.
  */
  function deploySplitsPayer(
    JBGroupedSplits calldata _groupedSplits,
    IJBSplitsStore _splitsStore,
    uint256 _defaultProjectId,
    address payable _defaultBeneficiary,
    bool _defaultPreferClaimedTokens,
    string calldata _defaultMemo,
    bytes calldata _defaultMetadata,
    bool _defaultPreferAddToBalance,
    IJBDirectory _directory,
    address _owner
  ) external override returns (IJBSplitsPayer splitsPayer) {
    // Deploy the splits payer.
    splitsPayer = new JBETHERC20SplitsPayer(
      _groupedSplits,
      _splitsStore,
      _defaultProjectId,
      _defaultBeneficiary,
      _defaultPreferClaimedTokens,
      _defaultMemo,
      _defaultMetadata,
      _defaultPreferAddToBalance,
      _directory,
      _owner
    );

    emit DeploySplitsPayer(
      splitsPayer,
      _groupedSplits,
      _splitsStore,
      _defaultProjectId,
      _defaultBeneficiary,
      _defaultPreferClaimedTokens,
      _defaultMemo,
      _defaultMetadata,
      _defaultPreferAddToBalance,
      _directory,
      _owner,
      msg.sender
    );
  }
}
