
using JBDirectory as _directory

methods {
    _directory.controllerOf(uint256 _projectId) returns (address) envfree;

    totalSupplyOf(
        uint256 _projectId
    ) returns (uint256 totalSupply) envfree

    balanceOf(
        address _holder,
        uint256 _projectId
    ) returns (uint256 balance) envfree

    unclaimedTotalSupplyOf(
        uint256 _project
    ) returns (uint256 _unclaimedSupply) envfree


    issueFor(
        uint256 _projectId,
        string _name,
        string _symbol
    ) returns (address)

    changeFor(
        uint256 _projectId,
        address _token,
        address _newOwner
    ) returns (address)

    mintFor(
        address _holder,
        uint256 _projectId,
        uint256 _amount,
        bool _preferClaimedTokens
    )

    burnFrom(
        address _holder,
        uint256 _projectId,
        uint256 _amount,
        bool _preferClaimedTokens
    )

    claimFor(
        address _holder,
        uint256 _projectId,
        uint256 _amount
    )

    transferFrom(
        address _holder,
        uint256 _projectId,
        address _recipient,
        uint256 _amount
    ) 

    shouldRequireClaimingFor(
        uint256 _projectId,
        bool _flag
    )
}

/**
    The sum of all holders unclaimed balances
*/
ghost mapping(uint256 => uint256) projectUnclaimedTotalSupply;

ghost unclaimedInitialState(uint256) returns uint256 {
  init_state axiom forall uint256 x. projectUnclaimedTotalSupply[x] == 0;
}

/**
    Hook for catching holder balance updates
*/
hook Sstore unclaimedBalanceOf[KEY address holder][KEY uint256 projectId] uint256 newUserBalance
    (uint256 oldUserBalance) STORAGE {
        projectUnclaimedTotalSupply[projectId] = projectUnclaimedTotalSupply[projectId] - oldUserBalance + newUserBalance;
    }

/**
    The sum of the holder balances should be equal to the totalSupply
*/
invariant projectTotalUnclaimedBalanceIsSumOfBalances(uint256 projectId)
    projectUnclaimedTotalSupply[projectId] == unclaimedTotalSupplyOf(projectId)



/*
    Make sure 'issueFor', 'changeFor', 'mintFor' and 'burnFrom' can only be called by the controller
*/
rule onlyControllerCanCall(uint256 projectId, method f, calldataarg args) {
    env e;

    address controllerOf = _directory.controllerOf(projectId);

    applyToProject(e, f, projectId);

    assert (
            f.selector == issueFor(uint256,string,string).selector ||
            f.selector == changeFor(uint256,address,address).selector ||
            f.selector == mintFor(address,uint256,uint256,bool).selector ||
            f.selector == burnFrom(address,uint256,uint256,bool).selector
        ) => e.msg.sender == controllerOf;
}


/**
    Perform an arbitrary call that impacts a specific project
*/
function applyToProject(env e, method f, uint256 projectId){

    if(f.selector == issueFor(uint256,string,string).selector){
        string name;
        string symbol;

        issueFor(e, projectId, name, symbol);
    }else if(f.selector == changeFor(uint256,address,address).selector){
        address token;
        address newOwner;

        changeFor(e, projectId, token, newOwner);
    }else if(f.selector == mintFor(address,uint256,uint256,bool).selector){
        address holder;
        uint256 amount;
        bool preferClaimed;

        mintFor(e, holder, projectId, amount, preferClaimed);
    }else if(f.selector == burnFrom(address,uint256,uint256,bool).selector){
        address holder;
        uint256 amount;
        bool preferClaimed;

        burnFrom(e, holder, projectId, amount, preferClaimed);
    }else if (f.selector == claimFor(address,uint256,uint256).selector){
        address holder;
        uint256 amount;

        claimFor(e, holder, projectId, amount);
    }else if (f.selector == transferFrom(address,uint256,address,uint256).selector){
        address holder;
        address recipient;
        uint256 amount;

        transferFrom(e, holder, projectId, recipient, amount);
    }else if (f.selector == shouldRequireClaimingFor(uint256,bool).selector){
        bool flag;

        shouldRequireClaimingFor(e, projectId, flag);
    }else{
        calldataarg args;
        f(e, args);
    }
}
