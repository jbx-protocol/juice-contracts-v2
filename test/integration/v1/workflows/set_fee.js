/** 
  Governance can set a new fee for future configurations in the TerminalV1.

  All current configurations will not be affected, and will keep the old fee until a new configuration is approved.
*/
import { constants } from '../../../helpers/utils';

// The currency will be 0, which corresponds to ETH, preventing the need for currency price conversion.
const currency = 0;

export default [
  {
    description: 'Deploy a project',
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      BigNumber,
      randomBytes,
      randomString,
      randomSignerFn,
      incrementFundingCycleIdFn,
      incrementProjectIdFn,
    }) => {
      const expectedProjectId = incrementProjectIdFn();
      const expectedFundingCycleId1 = incrementFundingCycleIdFn();

      // It should be the project's first budget.
      const expectedFundingCycleNumber1 = BigNumber.from(1);

      // The owner of the project that will reconfigure.
      const owner = randomSignerFn();

      // At the end of the tests, this amount will be attempted to be tapped.
      const amountToTap = BigNumber.from(1);

      // Make sure the target is arbitrarily larger than the amount that will be tapped, included fees that will be incurred.
      const target = randomBigNumber({ min: amountToTap.mul(2) });

      const duration = randomBigNumber({
        min: BigNumber.from(1),
        max: BigNumber.from(10000),
      });
      const cycleLimit = randomBigNumber({
        max: this.MaxCycleLimit,
      });

      // Make recurring.
      const discountRate = randomBigNumber({
        max: this.MaxPercent,
      });
      const ballot = constants.AddressZero;

      // Set the reserved rate to 0 to make test cases cleaner.
      const reservedRate = BigNumber.from(0);

      const bondingCurveRate = randomBigNumber({
        max: this.MaxPercent,
      });
      const reconfigurationBondingCurveRate = randomBigNumber({
        max: this.MaxPercent,
      });

      // Expect the funding cycle's weight to be the base weight.
      const expectedInitialWeight = await contracts.fundingCycles.BASE_WEIGHT();

      // Expect the funding cycle's fee to be the terminalV1's fee.
      const expectedFee = await contracts.terminalV1.fee();

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
            duration,
            cycleLimit,
            discountRate,
            ballot,
          },
          {
            reservedRate,
            bondingCurveRate,
            reconfigurationBondingCurveRate,
          },
          [],
          [],
        ],
      });
      return {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        owner,
        reconfigurationBondingCurveRate,
        bondingCurveRate,
        reservedRate,
        cycleLimit,
        ballot,
        duration,
        target,
        currency,
        discountRate,
        amountToTap,
        expectedInitialWeight,
        expectedFee,
      };
    },
  },
  {
    description: 'Make sure the funding cycle got saved correctly',
    fn: async ({
      contracts,

      BigNumber,
      timeMark,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        reconfigurationBondingCurveRate,
        bondingCurveRate,
        reservedRate,
        cycleLimit,
        ballot,
        duration,
        target,
        discountRate,
        expectedInitialWeight,
        expectedFee,
      },
    }) => {
      // Pack the metadata as expected.
      let expectedPackedMetadata = BigNumber.from(0);
      expectedPackedMetadata = expectedPackedMetadata.add(reconfigurationBondingCurveRate);
      expectedPackedMetadata = expectedPackedMetadata.shl(8);
      expectedPackedMetadata = expectedPackedMetadata.add(bondingCurveRate);
      expectedPackedMetadata = expectedPackedMetadata.shl(8);
      expectedPackedMetadata = expectedPackedMetadata.add(reservedRate);
      expectedPackedMetadata = expectedPackedMetadata.shl(8);

      // Expect the funding cycle to be based on the 0th funding cycle.
      const expectedBasedOn = BigNumber.from(0);

      // Expect nothing to have been tapped yet from the funding cycle.
      const expectedInitialTapped = BigNumber.from(0);

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'get',
        args: [expectedFundingCycleId1],
        expect: [
          expectedFundingCycleId1,
          expectedProjectId,
          expectedFundingCycleNumber1,
          expectedBasedOn,
          timeMark,
          cycleLimit,
          expectedInitialWeight,
          ballot,
          timeMark,
          duration,
          target,
          BigNumber.from(currency),
          expectedFee,
          discountRate,
          expectedInitialTapped,
          expectedPackedMetadata,
        ],
      });
      return {
        originalTimeMark: timeMark,
        expectedPackedMetadata,
        expectedInitialWeight,
        expectedFee,
        expectedInitialTapped,
      };
    },
  },
  {
    description: 'Set a new fee',
    fn: async ({ randomBigNumber, executeFn, deployer, contracts }) => {
      const newFee = randomBigNumber({ max: this.MaxPercent });
      await executeFn({
        caller: deployer,
        contract: contracts.governance,
        fn: 'setFee',
        args: [contracts.terminalV1.address, newFee],
      });
      return { newFee };
    },
  },
  {
    description: 'Fast forward to the next funding cycle that uses the same configuration',
    fn: ({ randomBigNumber, fastforwardFn, BigNumber, local: { duration } }) =>
      fastforwardFn(
        // An arbitrary day after the duration is within the next cycle.
        duration.mul(86400).add(
          randomBigNumber({
            min: BigNumber.from(5),
            max: BigNumber.from(86390),
          }),
        ),
      ),
  },
  {
    description: 'The funding cycle should still have the original fee',
    fn: async ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        originalTimeMark,
        cycleLimit,
        ballot,
        discountRate,
        duration,
        target,
        expectedPackedMetadata,
        expectedInitialWeight,
        expectedFee,
        expectedInitialTapped,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentOf',
        args: [expectedProjectId],
        expect: [
          BigNumber.from(0),
          expectedProjectId,
          expectedFundingCycleNumber1.add(1),
          expectedFundingCycleId1,
          originalTimeMark,
          cycleLimit.eq(0) ? BigNumber.from(0) : cycleLimit.sub(1),
          expectedInitialWeight
            .mul(this.DiscountRatePercentDenominator.sub(discountRate))
            .div(this.DiscountRatePercentDenominator),
          ballot,
          originalTimeMark.add(duration.mul(86400)),
          duration,
          target,
          BigNumber.from(currency),
          expectedFee,
          discountRate,
          expectedInitialTapped,
          expectedPackedMetadata,
        ],
      }),
  },
  {
    description: 'Make a payment to lock in the first configuration',
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      getBalance,
      randomString,
      randomAddressFn,

      randomSignerFn,
      BigNumber,
      local: { expectedProjectId },
    }) => {
      // An account that will be used to make payments.
      const payer = randomSignerFn();

      // One payment will be made. Cant pay entire balance because some is needed for gas.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue = randomBigNumber({
        // The min should be some decently meaningful number.
        // Otherwise its possible that the weight amount of the payment is 0, which means no tickets will be printed,
        // which means the configuration in this test will configure the active cycle and not expect it.
        min: BigNumber.from(100),
        max: (await getBalance(payer.address)).div(100),
      });

      await executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedProjectId, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue,
      });

      return { paymentValue };
    },
  },
  {
    description:
      'Reconfiguring a project after a new fee has been set should affect future funding cycles',
    fn: async ({
      contracts,
      executeFn,
      incrementFundingCycleIdFn,
      local: {
        expectedProjectId,
        owner,
        target,
        duration,
        cycleLimit,
        discountRate,
        ballot,
        reservedRate,
        bondingCurveRate,
        reconfigurationBondingCurveRate,
      },
    }) => {
      const expectedFundingCycleId2 = incrementFundingCycleIdFn();
      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            target,
            currency,
            duration,
            cycleLimit,
            discountRate,
            ballot,
          },
          {
            reservedRate,
            bondingCurveRate,
            reconfigurationBondingCurveRate,
          },
          [],
          [],
        ],
      });
      return { expectedFundingCycleId2 };
    },
  },
  {
    description: 'The queued funding cycle should use the new fee',
    fn: async ({
      contracts,

      timeMark,
      randomSignerFn,
      BigNumber,
      local: {
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        originalTimeMark,
        newFee,
        target,
        cycleLimit,
        ballot,
        discountRate,
        duration,
        expectedPackedMetadata,
        expectedFundingCycleId2,
        expectedProjectId,
        expectedInitialWeight,
        expectedInitialTapped,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'queuedOf',
        args: [expectedProjectId],
        expect: [
          expectedFundingCycleId2,
          expectedProjectId,
          expectedFundingCycleNumber1.add(2),
          expectedFundingCycleId1,
          timeMark,
          cycleLimit,
          expectedInitialWeight
            .mul(this.DiscountRatePercentDenominator.sub(discountRate))
            .mul(this.DiscountRatePercentDenominator.sub(discountRate))
            .div(this.DiscountRatePercentDenominator)
            .div(this.DiscountRatePercentDenominator),
          ballot,
          originalTimeMark.add(duration.mul(86400).mul(2)),
          duration,
          target,
          BigNumber.from(currency),
          newFee,
          discountRate,
          expectedInitialTapped,
          expectedPackedMetadata,
        ],
      }),
  },
  {
    description: "The current shouldn't be affected",
    fn: async ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        originalTimeMark,
        cycleLimit,
        ballot,
        discountRate,
        duration,
        target,
        expectedPackedMetadata,
        expectedInitialWeight,
        expectedFee,
        expectedInitialTapped,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentOf',
        args: [expectedProjectId],
        expect: [
          BigNumber.from(0),
          expectedProjectId,
          expectedFundingCycleNumber1.add(1),
          expectedFundingCycleId1,
          originalTimeMark,
          cycleLimit.eq(0) ? BigNumber.from(0) : cycleLimit.sub(1),
          expectedInitialWeight
            .mul(this.DiscountRatePercentDenominator.sub(discountRate))
            .div(this.DiscountRatePercentDenominator),
          ballot,
          originalTimeMark.add(duration.mul(86400)),
          duration,
          target,
          BigNumber.from(currency),
          expectedFee,
          discountRate,
          expectedInitialTapped,
          expectedPackedMetadata,
        ],
      }),
  },
  {
    description: 'Tap some of the current funding cycle',
    fn: async ({
      randomSignerFn,
      contracts,
      executeFn,
      incrementFundingCycleIdFn,
      local: { expectedProjectId, amountToTap },
    }) => {
      // Tapping should create a new funding cycle.
      const expectedFundingCycleId3 = incrementFundingCycleIdFn();

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedProjectId, amountToTap, currency, 0],
      });
      return { expectedFundingCycleId3 };
    },
  },
  {
    description: 'The current should have the tapped amount',
    fn: async ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        originalTimeMark,
        cycleLimit,
        ballot,
        discountRate,
        duration,
        target,
        amountToTap,
        expectedFundingCycleId3,
        expectedPackedMetadata,
        expectedInitialWeight,
        expectedFee,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentOf',
        args: [expectedProjectId],
        expect: [
          expectedFundingCycleId3,
          expectedProjectId,
          expectedFundingCycleNumber1.add(1),
          expectedFundingCycleId1,
          originalTimeMark,
          cycleLimit.eq(0) ? BigNumber.from(0) : cycleLimit.sub(1),
          expectedInitialWeight
            .mul(this.DiscountRatePercentDenominator.sub(discountRate))
            .div(this.DiscountRatePercentDenominator),
          ballot,
          originalTimeMark.add(duration.mul(86400)),
          duration,
          target,
          BigNumber.from(currency),
          expectedFee,
          discountRate,
          amountToTap,
          expectedPackedMetadata,
        ],
      }),
  },
];
