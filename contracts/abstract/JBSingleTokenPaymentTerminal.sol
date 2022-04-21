// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/utils/introspection/ERC165.sol';
import './../interfaces/IJBSingleTokenPaymentTerminal.sol';

/**
  @notice
  Generic terminal managing all inflows of funds into the protocol ecosystem for one token.

  @dev
  Adheres to:
  IJBSingleTokenPaymentTerminals: General interface for the methods in this contract that interact with the blockchain's state according to the protocol's rules.
*/
abstract contract JBSingleTokenPaymentTerminal is IJBSingleTokenPaymentTerminal, ERC165 {
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

  /** 
    @notice
    A flag indicating if this terminal accepts the specified token.

    @param _token The token to check if this terminal accepts or not.

    @return The flag.
  */
  function acceptsToken(address _token) external view override returns (bool) {
    return _token == token;
  }

  /** 
    @notice
    The decimals that should be used in fixed number accounting for the specified token.

    ignored: _token The token to check for the decimals of.

    @return The number of decimals for the token.
  */
  function decimalsForToken(address) external view override returns (uint256) {
    return decimals;
  }

  /** 
    @notice
    The currency that should be used for the specified token.

    ignored: _token The token to check for the currency of.

    @return The currency index.
  */
  function currencyForToken(address) external view override returns (uint256) {
    return currency;
  }

  /**
    @dev See {IERC165-supportsInterface}.
  */
  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC165, IERC165)
    returns (bool)
  {
    return
      interfaceId == type(IJBPaymentTerminal).interfaceId ||
      interfaceId == type(IJBSingleTokenPaymentTerminal).interfaceId ||
      super.supportsInterface(interfaceId);
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
