
methods{
    permissionsOf(
        address, // _operator
        address, // _account
        uint256 // domain
    ) returns (uint256) envfree;

    hasPermission(
        address,    // _operator,
        address,    // _account,
        uint256,    // _domain,
        uint256     // _permissionIndex
    ) returns (bool) envfree

    hasPermissions(
        address,     //_operator,
        address,     //_account,
        uint256,     //_domain,
        uint256[]    //calldata _permissionIndexes
    ) returns (bool) envfree

    setOperator(
        address,    // _operator,
        uint256,    // _domain,
        uint256[]   // calldata _indexes
    )
}

rule onlyUserCanChangePermissions(env e, address operator, address account, uint256 domain, uint256 permissionIndex){
    method f;
    calldataarg args;

    //  Get the permission beforehand
    bool permissionBefore = hasPermission(operator, account, domain, permissionIndex);

    // Call arbitrary method/calldata
    f(e, args);

    // Get the permissions afterwards
    bool permissionAfer = hasPermission(operator, account, domain, permissionIndex);

    assert permissionBefore != permissionAfer => e.msg.sender == account;
}

rule userCanAlwaysRemovePermissions(env e, address operator, uint256 domain){
    // Method is not payable
    require e.msg.value == 0;

    // Remove all permissions
    uint256[] indexes = [];

    setOperator@withrevert(e, operator, domain, indexes);
    bool succeeded = !lastReverted;

    uint256 indexToCheck;
    assert succeeded &&
             hasPermission(operator, e.msg.sender, domain, indexToCheck) == false &&
             permissionsOf(operator, e.msg.sender, domain) == 0;
}

rule changingOperatorDomainPermissionsDoesNotAffectAnyOther(env e, address operatorA, uint256 domainA, uint256[] indexesA, address userB, address operatorB, uint256 domainB){
    // Can't both be regarding the same permissions
    require operatorA != operatorB || domainA != domainB || e.msg.sender != userB;

    // Get the state of B
    uint256 bPermissionsBefore = permissionsOf(operatorB, userB, domainB);

    // Update A
    setOperator(e, operatorA, domainA, indexesA);

    // Assert that B did not change
    assert bPermissionsBefore == permissionsOf(operatorB, userB, domainB);
}