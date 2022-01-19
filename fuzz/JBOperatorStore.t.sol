// SPDX-License-Identifier: Unlicense
pragma solidity 0.8.6;

import 'ds-test/test.sol';
import 'forge-std/Vm.sol';

import {JBOperatorStore} from '@juicebox/JBOperatorStore.sol';
import {JBOperatorData} from '@juicebox/structs/JBOperatorData.sol';

contract JBOperatorStoreTest is DSTest {
  Vm public constant vm = Vm(HEVM_ADDRESS);

  JBOperatorStore internal store;

  function setUp() public {
    store = new JBOperatorStore();
  }

  function testSetOperator(uint256 domain, uint8[64] calldata _idxs) public {
    address operator = vm.addr(1);
    uint256[] memory idxs = new uint256[](_idxs.length);
    for (uint256 i = 0; i < _idxs.length; i++) {
      idxs[i] = _idxs[i];
    }
    store.setOperator(
      JBOperatorData({operator: operator, domain: domain, permissionIndexes: idxs})
    );
    assertTrue(store.hasPermissions(operator, address(this), domain, idxs));
  }

  function testSetOperators(uint256[10] calldata domains, uint8[64] calldata _idxs) public {
    address operator = vm.addr(1);

    uint256[] memory idxs = new uint256[](_idxs.length);
    for (uint256 i = 0; i < _idxs.length; i++) {
      idxs[i] = _idxs[i];
    }

    JBOperatorData[] memory _operatorData = new JBOperatorData[](10);
    for (uint256 i = 0; i < domains.length; i++) {
      _operatorData[i] = JBOperatorData({
        operator: operator,
        domain: domains[i],
        permissionIndexes: idxs
      });
    }

    store.setOperators(_operatorData);

    for (uint256 i = 0; i < _operatorData.length; i++) {
      assertTrue(
        store.hasPermissions(
          operator,
          address(this),
          _operatorData[i].domain,
          _operatorData[i].permissionIndexes
        )
      );
    }
  }
}
