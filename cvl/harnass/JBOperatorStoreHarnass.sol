// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import "../../contracts/JBOperatorStore.sol";

// Harnass for JBOperatorStore so we don't have to work with the custom JBOperatorData type
contract JBOperatorStoreHarnass is JBOperatorStore {

    // JBOperatorData is too complex (contains array) so this method does the *exact* same but with plain arguments
    function setOperator(address _operator, uint256 _domain, uint256[] calldata _indexes) public {
        // Pack the indexes into a uint256.
        uint256 _packed = _packedPermissionsHarnass(_indexes);

        // Store the new value.
        permissionsOf[_operator][msg.sender][_domain] = _packed;

        emit SetOperator(
        _operator,
        msg.sender,
        _domain,
        _indexes,
        _packed
        );
    }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    Converts an array of permission indexes to a packed `uint256`.

    @param _indexes The indexes of the permissions to pack.

    @return packed The packed value.
  */
  function _packedPermissionsHarnass(uint256[] calldata _indexes) private pure returns (uint256 packed)  {
    for (uint256 _i = 0; _i < _indexes.length; _i++) {
      uint256 _index = _indexes[_i];

      if (_index > 255) revert PERMISSION_INDEX_OUT_OF_BOUNDS();

      // Turn the bit at the index on.
      packed |= 1 << _index;
    }
  }
}