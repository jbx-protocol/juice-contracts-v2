// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

// import '@openzeppelin/contracts/utils/Address.sol';
// import '@paulrberg/contracts/math/PRBMathUD60x18.sol';
// import '@paulrberg/contracts/math/PRBMath.sol';

// import './libraries/JBCurrencies.sol';
// import './libraries/JBOperations.sol';
// import './libraries/JBSplitsGroups.sol';
// import './libraries/JBFundingCycleMetadataResolver.sol';

// // Inheritance
// import './interfaces/IJBETHPaymentTerminal.sol';
// import './interfaces/IJBTerminal.sol';
// import './abstract/JBOperatable.sol';
// import '@openzeppelin/contracts/access/Ownable.sol';
// import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import './interfaces/IJBDirectory.sol';
import './interfaces/IJBVault.sol';

contract JBETHPaymentTerminal is IJBVault {
  modifier onlyTerminal(uint256 _projectId) {
    require(directory.isTerminalOf(_projectId, msg.sender), 'UNAUTHORIZED');
    _;
  }

  /** 
    @notice
    The directory of terminals and controllers for projects.
  */
  IJBDirectory public immutable override directory;

  function token() external pure override returns (address) {
    return address(0);
  }

  /** 
    @param _directory The directory of terminals.
  */
  constructor(IJBDirectory _directory) {
    directory = _directory;
  }

  function deposit(uint256 _projectId, uint256 _amount)
    external
    payable
    override
    onlyTerminal(_projectId)
  {}

  function withdraw(
    uint256 _projectId,
    uint256 _amount,
    address payable _to
  ) external override onlyTerminal(_projectId) {
    Address.sendValue(_to, _amount);
  }
}
