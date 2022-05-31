//SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './interfaces/IJBPaymentTerminal.sol';

/**
 @title 
 Juicebox Multi-addToBalance / multi-pay() with custom beneficiaries
 @dev
 Part of the FC post-bug recovery -> this to recreate the activity existing projects affected
 had and refund the gas used while deploying the previous (buggy) project
*/
contract Multipay {
    IJBPaymentTerminal public immutable jbTerminal;

    //eligible for gas refund: [28, 26, 24, 23, 22, 21, 19, 13, 11, 10, 4, 1]

    /**
        @param _jbTerminal the current eth terminal
    */
    constructor(IJBPaymentTerminal _jbTerminal) {
        jbTerminal = _jbTerminal;
    }

    /**
        @notice wrapper around the gas refund and the pay(..) calls
        @dev    the 4 first arrays NEED to be ordered accordingly
        @param  projectIds the project id to contribute to
        @param  beneficiaries the beneficiary contributing to the corresponding projectId
        @param  amounts the amount to contribute, in wei
        @param  memos the optional memo passed
        @param  projectsGas the lish of project id requiring a gas refund 
    */
    function process(
        uint256[] calldata projectIds,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        string[] calldata memos,
        uint256[] calldata projectsGas
        ) external payable {
            refundGas(projectsGas);
            processPay(
                projectIds,
                beneficiaries,
                amounts,
                memos
            );
        }

    /**
        @notice stand-alone to refund gas to projects - hardcoded at 0.2eth for fairness
    */
    function refundGas(uint256[] calldata projectsGas) public payable {
        for (uint256 i; i < projectsGas.length; ++i) {
            jbTerminal.addToBalanceOf{value: 0.2 ether}(
                projectsGas[i],
                0.2 ether,
                address(0),
                'gas refund',
                new bytes(0)
            );
        }
    }

    /**
        @notice stand-alone to process a list of pay(..) to trigger
        @dev    the 4 arrays NEED to follow the same order. ETH left-over are sent back to the caller.
    */
    function processPay(
        uint256[] calldata projectIds,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        string[] calldata memos
    ) public payable {
        for (uint256 i; i < projectIds.length; ++i) {
            jbTerminal.pay{value: amounts[i]}(
                projectIds[i],
                amounts[i],
                address(0),
                beneficiaries[i],
                0,
                true,
                memos[i],
                new bytes(0)
            );
        }

        if (payable(address(this)).balance > 0)
            payable(msg.sender).call{value: payable(address(this)).balance}('');
    }

    /**
        @notice compute the amount (in wei) to send to cover the activity based on the
                array passed
    */
    function computeTotalEthToSend(
        uint256[] calldata projectIds,
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        string[] calldata memos,
        uint256[] calldata gasToRefund
    ) external view returns (uint256 amount) {
        amount = 0.2 ether * gasToRefund.length;

        for (uint256 i; i < projectIds.length; ++i) {
            amount += amounts[i];
        }
    }
}
