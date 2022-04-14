// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './../interfaces/IJBSingleTokenPaymentTerminal.sol';

/**
  @notice
  Generic terminal managing all inflows and outflows of funds into the protocol ecosystem for one token.

  @dev
  A project can transfer its funds, along with the power to reconfigure and mint/burn their tokens, from this contract to another allowed terminal of the same token type contract at any time.

  @dev
  Adheres to:
  IJBSingleTokenPaymentTerminals: General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.

  @dev
  Inherits from:
  JBOperatable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
  Ownable: Includes convenience functionality for checking a message sender's permissions before executing certain transactions.
  ReentrancyGuard: Contract module that helps prevent reentrant calls to a function.
*/
abstract contract JBSingleTokenPaymentTerminal is IJBSingleTokenPaymentTerminal {
  //*********************************************************************//
  // ---------------- public immutable stored properties --------------- //
  //*********************************************************************//
  /**
    @notice
    The token that this terminal accepts.
  */
  address public immutable override token;

  /**
    @notice
    The number of decimals the token fixed point amounts are expected to have.
  */
  uint256 public immutable override decimals;

  /**
    @notice
    The currency to use when resolving price feeds for this terminal.
  */
  uint256 public immutable override currency;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  function acceptsToken(address _token) external view override returns (bool) {
    return _token == token;
  }

  function currencyForToken(address) external view override returns (uint256) {
    return currency;
  }

  function decimalsForToken(address) external view override returns (uint256) {
    return decimals;
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /**
    @param _token The token that this terminal manages.
    @param _decimals The number of decimals the token fixed point amounts are expected to have.
    @param _currency The currency that this terminal's token adheres to for price feeds.
  */
  constructor(
    address _token,
    uint256 _decimals,
    uint256 _currency
  ) {
    token = _token;
    decimals = _decimals;
    currency = _currency;
  }
}
