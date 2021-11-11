/** 
  The governance of the TerminalV1 can transfer its power to a new address.
  To do so, the governance must appoint a new address, and that address must accept the appointment.
*/
import { randomBigNumber } from '../../../helpers/utils';

export default [
  {
    description: 'The initial governance can set a new fee',
    fn: ({ executeFn, deployer, contracts, constants }) =>
      executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'setFee',
        args: [contracts.terminalV1.address, randomBigNumber({ max: this.MaxPercent })],
      }),
  },
  {
    description: 'Appoint a new governance',
    fn: async ({ executeFn, deployer, contracts, randomSignerFn }) => {
      // Appoint a governance with a different address.
      const firstAppointedGovernance = randomSignerFn();

      await executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'appointGovernance',
        args: [contracts.terminalV1.address, firstAppointedGovernance.address],
      });
      return { firstAppointedGovernance };
    },
  },
  {
    description: "The appointed governance shouldn't yet be able to set a fee",
    fn: ({
      executeFn,
      contracts,

      local: { firstAppointedGovernance },
    }) =>
      executeFn({
        caller: firstAppointedGovernance,
        contract: contracts.terminalV1,
        fn: 'setFee',
        args: [randomBigNumber({ max: this.MaxPercent })],
        revert: 'TerminalV1: UNAUTHORIZED',
      }),
  },
  {
    description: 'The current governance should still be able to set a fee',
    fn: ({ executeFn, deployer, contracts, constants }) =>
      executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'setFee',
        args: [contracts.terminalV1.address, randomBigNumber({ max: this.MaxPercent })],
      }),
  },
  {
    description: 'Appoint a different governance',
    fn: async ({ executeFn, deployer, contracts, randomSignerFn }) => {
      // Appoint another governance with yet another address.
      const secondAppointedGovernance = randomSignerFn();
      await executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'appointGovernance',
        args: [contracts.terminalV1.address, secondAppointedGovernance.address],
      });
      return { secondAppointedGovernance };
    },
  },
  {
    description:
      "If they're different, the first appointed governance should no longer be able to accept",
    fn: ({
      executeFn,
      contracts,
      local: { firstAppointedGovernance, secondAppointedGovernance },
    }) =>
      executeFn({
        caller: firstAppointedGovernance,
        contract: contracts.terminalV1,
        fn: 'acceptGovernance',
        args: [],
        revert:
          firstAppointedGovernance.address !== secondAppointedGovernance.address &&
          'TerminalV1::acceptGovernance: UNAUTHORIZED',
      }),
  },
  {
    description: 'Accept a new governance',
    fn: ({ executeFn, contracts, local: { secondAppointedGovernance } }) =>
      executeFn({
        caller: secondAppointedGovernance,
        contract: contracts.terminalV1,
        fn: 'acceptGovernance',
        args: [],
      }),
  },
  {
    description: 'The old governance should no longer be able to set a fee',
    fn: ({
      executeFn,
      deployer,
      contracts,

      local: { secondAppointedGovernance },
    }) =>
      executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'setFee',
        args: [contracts.terminalV1.address, randomBigNumber({ max: this.MaxPercent })],
        revert:
          contracts.governance.address !== secondAppointedGovernance.address &&
          'TerminalV1: UNAUTHORIZED',
      }),
  },
  {
    description: 'The new governance should be able to set a fee',
    fn: ({
      executeFn,

      contracts,
      local: { secondAppointedGovernance },
    }) =>
      executeFn({
        caller: secondAppointedGovernance,
        contract: contracts.terminalV1,
        fn: 'setFee',
        args: [randomBigNumber({ max: this.MaxPercent })],
      }),
  },
  {
    description: 'New governance should be able to appoint the old governance back',
    fn: ({ executeFn, contracts, local: { secondAppointedGovernance } }) =>
      executeFn({
        caller: secondAppointedGovernance,
        contract: contracts.terminalV1,
        fn: 'appointGovernance',
        args: [contracts.governance.address],
      }),
  },
  {
    description: 'Set the old governance back',
    fn: ({ executeFn, contracts, deployer }) => {
      executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'acceptGovernance',
        args: [contracts.terminalV1.address],
      });
    },
  },
];
