/** 
  When a project's funds are tapped, the governance project should take a fee through its current terminal.
*/

import { BigNumber } from 'ethers';

import { constants, deployContract } from '../../../utils';

// The currency will be 0, which corresponds to ETH, preventing the need for currency price conversion.
const currency = 0;

export default [
  {
    description: 'Deploy a project',
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      getBalanceFn,
      randomString,
      incrementProjectIdFn,
      incrementFundingCycleIdFn,
      randomSignerFn,
      randomBytes,
    }) => {
      const expectedProjectId = incrementProjectIdFn();

      // Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      // The owner of the project with mods.
      // Exclude the governance project's owner to make the test calculations cleaner.
      const owner = randomSignerFn();

      // An account that will be used to make a payment.
      const payer = randomSignerFn();

      // One payments will be made.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue = randomBigNumber({
        // Two amounts need to be tapped, so make the minimum an amount at least 2.
        min: BigNumber.from(2),
        max: (await getBalanceFn(payer.address)).div(100),
      });

      // Make the target the payment value to make some of the test cases cleaner.
      const target = paymentValue;

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'deploy',
        args: [
          owner.address,
          randomBytes({
            // Make sure its unique by prepending the id.
            prepend: expectedProjectId.toString(),
          }),
          randomString(),
          {
            target,
            currency,
            duration: randomBigNumber({
              min: BigNumber.from(1),
              max: constants.MaxUint16,
            }),
            cycleLimit: randomBigNumber({
              max: this.MaxCycleLimit,
            }),
            // Recurring.
            discountRate: randomBigNumber({
              max: this.MaxPercent.sub(1),
            }),
            ballot: constants.AddressZero,
          },
          {
            // Don't use a reserved rate to make the calculations a little simpler.
            reservedRate: BigNumber.from(0),
            bondingCurveRate: randomBigNumber({
              max: this.MaxPercent,
            }),
            reconfigurationBondingCurveRate: randomBigNumber({
              max: this.MaxPercent,
            }),
          },
          [],
          [],
        ],
      });
      return {
        owner,
        payer,
        paymentValue,
        expectedProjectId,
        target,
      };
    },
  },
  {
    description: 'Make a payment to the project',
    fn: ({
      contracts,
      executeFn,

      randomString,
      randomAddressFn,
      local: { payer, paymentValue, expectedProjectId },
    }) =>
      executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedProjectId, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue,
      }),
  },
  {
    description: 'Tap funds for the project to incure the fee',
    fn: async ({
      contracts,
      executeFn,
      randomSignerFn,
      randomBigNumber,
      local: { target, expectedProjectId },
    }) => {
      // Tap some of the target.
      const amountToTap1 = target.sub(
        randomBigNumber({ min: BigNumber.from(1), max: target.sub(1) }),
      );

      // Save the initial balances of the owner, address mod beneficiary, and the allocator mod contract.
      const governanceInitialBalance = await contracts.terminalV1.balanceOf(
        this.GovernanceProjectId,
      );

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedProjectId, amountToTap1, currency, amountToTap1],
      });

      return {
        amountToTap1,
        governanceInitialBalance,
      };
    },
  },
  {
    description: 'Check that the governance project now has a balance',
    fn: async ({
      contracts,

      randomSignerFn,
      local: { amountToTap1, governanceInitialBalance },
    }) => {
      // A fee should be taken.
      const expectedFeeAmount1 = amountToTap1.sub(
        amountToTap1
          .mul(this.MaxPercent)
          .div((await contracts.terminalV1.fee()).add(this.MaxPercent)),
      );

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'balanceOf',
        args: [this.GovernanceProjectId],
        expect: governanceInitialBalance.add(expectedFeeAmount1),
      });

      return { expectedFeeAmount1 };
    },
  },
  {
    description: 'Allow migration to a new terminalV1',
    fn: async ({ deployer, contracts, executeFn }) => {
      // The terminalV1 that will be migrated to.
      const secondTerminalV1 = await deployContract('TerminalV1', [
        contracts.projects.address,
        contracts.fundingCycles.address,
        contracts.ticketBooth.address,
        contracts.operatorStore.address,
        contracts.modStore.address,
        contracts.prices.address,
        contracts.terminalDirectory.address,
        contracts.governance.address,
      ]);

      await executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'allowMigration',
        args: [contracts.terminalV1.address, secondTerminalV1.address],
      });

      return { secondTerminalV1 };
    },
  },
  {
    description: 'Migrating to the new terminalV1',
    fn: async ({ contracts, executeFn, local: { owner, expectedProjectId, secondTerminalV1 } }) =>
      executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'migrate',
        args: [expectedProjectId, secondTerminalV1.address],
      }),
  },
  {
    description: 'Tap funds for the project in the second terminalV1 to incure the fee',
    fn: async ({
      executeFn,
      randomSignerFn,
      local: { target, expectedProjectId, amountToTap1, secondTerminalV1 },
    }) => {
      // Tap the other portion of the target.
      const amountToTap2 = target.sub(amountToTap1);

      await executeFn({
        caller: randomSignerFn(),
        contract: secondTerminalV1,
        fn: 'tap',
        args: [expectedProjectId, amountToTap2, currency, amountToTap2],
      });

      return {
        amountToTap2,
      };
    },
  },
  {
    description: 'Check that the governance project got the fee in its terminal',
    fn: async ({
      contracts,

      randomSignerFn,
      local: { amountToTap2, governanceInitialBalance, expectedFeeAmount1 },
    }) => {
      // A fee should be taken.
      const expectedFeeAmount2 = amountToTap2.sub(
        amountToTap2
          .mul(this.MaxPercent)
          .div((await contracts.terminalV1.fee()).add(this.MaxPercent)),
      );

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'balanceOf',
        args: [this.GovernanceProjectId],
        expect: governanceInitialBalance.add(expectedFeeAmount1).add(expectedFeeAmount2),
      });
    },
  },
];
