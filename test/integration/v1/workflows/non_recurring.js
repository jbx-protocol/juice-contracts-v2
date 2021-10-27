/** 
  A funding cycle configuration can have a discount rate of of 0. This makes it non recurring.
*/
import { constants } from '../../../utils';

// The currency will be 0, which corresponds to ETH, preventing the need for currency price conversion.
const currency = 0;

// Expect the first funding cycle to be based on the 0th funding cycle.
const expectedInitialBasedOn = 0;

export default [
  {
    description: 'Deploy a project with a discount rate of 0',
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
      const expectedFundingCycleId1 = incrementFundingCycleIdFn();
      const expectedProjectId = incrementProjectIdFn();

      // It should be the project's first budget.
      const expectedFundingCycleNumber1 = BigNumber.from(1);

      // The owner of the project that will reconfigure.
      const owner = randomSignerFn();

      // At the end of the tests, this amount will be attempted to be tapped.
      const amountToTap = BigNumber.from(1);

      // Make sure the target is arbitrarily larger than the amount that will be tapped, included fees that will be incurred.
      const target1 = randomBigNumber({ min: amountToTap.mul(2) });

      const duration1 = randomBigNumber({
        min: BigNumber.from(1),
        max: constants.MaxUint16,
      });

      const cycleLimit1 = randomBigNumber({
        min: BigNumber.from(1),
        max: this.MaxCycleLimit,
      });

      const discountRate1 = BigNumber.from(this.MaxDiscountRate);

      const ballot1 = constants.AddressZero;

      const reservedRate1 = randomBigNumber({ max: this.MaxPercent });
      const bondingCurveRate1 = randomBigNumber({
        max: this.MaxPercent,
      });
      const reconfigurationBondingCurveRate1 = randomBigNumber({
        max: this.MaxPercent,
      });
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
            target: target1,
            currency,
            duration: duration1,
            cycleLimit: cycleLimit1,
            discountRate: discountRate1,
            ballot: ballot1,
          },
          {
            reservedRate: reservedRate1,
            bondingCurveRate: bondingCurveRate1,
            reconfigurationBondingCurveRate: reconfigurationBondingCurveRate1,
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
        target1,
        cycleLimit1,
        ballot1,
        duration1,
        discountRate1,
        reconfigurationBondingCurveRate1,
        bondingCurveRate1,
        reservedRate1,
        amountToTap,
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
        target1,
        cycleLimit1,
        ballot1,
        duration1,
        discountRate1,
        reconfigurationBondingCurveRate1,
        bondingCurveRate1,
        reservedRate1,
      },
    }) => {
      // Pack the metadata as expected.
      let expectedPackedMetadata1 = BigNumber.from(0);
      expectedPackedMetadata1 = expectedPackedMetadata1.add(reconfigurationBondingCurveRate1);
      expectedPackedMetadata1 = expectedPackedMetadata1.shl(8);
      expectedPackedMetadata1 = expectedPackedMetadata1.add(bondingCurveRate1);
      expectedPackedMetadata1 = expectedPackedMetadata1.shl(8);
      expectedPackedMetadata1 = expectedPackedMetadata1.add(reservedRate1);
      expectedPackedMetadata1 = expectedPackedMetadata1.shl(8);

      // Expect the funding cycle's weight to be the base weight.
      const expectedInitialWeight = await contracts.fundingCycles.BASE_WEIGHT();

      // Expect the funding cycle's fee to be the terminalV1's fee.
      const expectedFee = await contracts.terminalV1.fee();

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
          BigNumber.from(expectedInitialBasedOn),
          timeMark,
          // Cycle limit should be 0 for the first funding cycle.
          cycleLimit1,
          expectedInitialWeight,
          ballot1,
          timeMark,
          duration1,
          target1,
          BigNumber.from(currency),
          expectedFee,
          discountRate1,
          expectedInitialTapped,
          expectedPackedMetadata1,
        ],
      });
      return {
        originalTimeMark: timeMark,
        expectedPackedMetadata1,
        expectedInitialWeight,
        expectedFee,
        expectedInitialTapped,
      };
    },
  },
  {
    description: 'The funding cycle should be current',
    fn: async ({
      contracts,

      BigNumber,
      timeMark,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        target1,
        cycleLimit1,
        ballot1,
        duration1,
        discountRate1,
        expectedPackedMetadata1,
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
          expectedFundingCycleId1,
          expectedProjectId,
          expectedFundingCycleNumber1,
          BigNumber.from(expectedInitialBasedOn),
          timeMark,
          // Cycle limit should be 0 for the first funding cycle.
          cycleLimit1,
          expectedInitialWeight,
          ballot1,
          timeMark,
          duration1,
          target1,
          BigNumber.from(currency),
          expectedFee,
          discountRate1,
          expectedInitialTapped,
          expectedPackedMetadata1,
        ],
      }),
  },
  {
    description: 'There should be no queued cycle',
    fn: ({ contracts, randomSignerFn, BigNumber, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'queuedOf',
        args: [expectedProjectId],
        expect: [
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          constants.AddressZero,
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ],
      }),
  },
  {
    description: 'Reconfiguring the project should still be possible before a payment is made',
    fn: async ({
      contracts,
      executeFn,
      BigNumber,
      randomBigNumber,
      local: {
        owner,
        expectedProjectId,
        target1,
        cycleLimit1,
        ballot1,
        discountRate1,
        reconfigurationBondingCurveRate1,
        bondingCurveRate1,
        reservedRate1,
      },
    }) => {
      const duration2 = randomBigNumber({
        min: BigNumber.from(1),
        max: constants.MaxUint16,
      });
      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            target: target1,
            currency,
            duration: duration2,
            cycleLimit: cycleLimit1,
            discountRate: discountRate1,
            ballot: ballot1,
          },
          {
            reservedRate: reservedRate1,
            bondingCurveRate: bondingCurveRate1,
            reconfigurationBondingCurveRate: reconfigurationBondingCurveRate1,
          },
          [],
          [],
        ],
      });
      return { duration2 };
    },
  },
  {
    description: 'Make a payment to the project to lock it in',
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      BigNumber,
      getBalanceFn,
      randomString,
      randomAddressFn,

      randomSignerFn,
      local: { expectedProjectId },
    }) => {
      // An account that will be used to make payments.
      const payer = randomSignerFn();

      // One payment will be made. Cant pay entire balance because some is needed for gas.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue = randomBigNumber({
        min: BigNumber.from(1),
        max: (await getBalanceFn(payer.address)).div(100),
      });

      await executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedProjectId, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue,
      });
    },
  },
  {
    description: "Reconfiguring the project shouldn't be possible",
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      BigNumber,
      local: { owner, expectedProjectId },
    }) =>
      executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            target: randomBigNumber(),
            currency: randomBigNumber({ max: constants.MaxUint8 }),
            duration: randomBigNumber({
              min: BigNumber.from(1),
              max: constants.MaxUint16,
            }),
            cycleLimit: randomBigNumber({
              min: BigNumber.from(0),
              max: this.MaxCycleLimit,
            }),
            discountRate: randomBigNumber({
              max: this.MaxPercent,
            }),
            ballot: constants.AddressZero,
          },
          {
            reservedRate: randomBigNumber({ max: this.MaxPercent }),
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
        revert: 'FundingCycles::_configurable: NON_RECURRING',
      }),
  },
  {
    description: 'Fastforward a after the duration',
    fn: async ({ fastforwardFn, local: { duration2 } }) => fastforwardFn(duration2.mul(86400)),
  },
  {
    description: 'There should be no current cycle',
    fn: ({ contracts, randomSignerFn, BigNumber, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentOf',
        args: [expectedProjectId],
        expect: [
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          constants.AddressZero,
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ],
      }),
  },
  {
    description: 'There should be no queued cycle',
    fn: ({ contracts, randomSignerFn, BigNumber, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentOf',
        args: [expectedProjectId],
        expect: [
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          constants.AddressZero,
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
          BigNumber.from(0),
        ],
      }),
  },
  {
    description: 'Shouldnt be tappable',
    fn: ({ contracts, executeFn, randomSignerFn, BigNumber, local: { expectedProjectId } }) =>
      executeFn({
        // Dont use the owner or address mod beneficiary or else the gas spent will mess up the calculation.
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedProjectId, BigNumber.from(1), currency, BigNumber.from(0)],
        revert: 'FundingCycles::_tappable: NON_RECURRING',
      }),
  },
  {
    description: "Reconfiguring the project still shouldn't work",
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      BigNumber,
      local: { owner, expectedProjectId },
    }) =>
      executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            target: randomBigNumber(),
            currency: randomBigNumber({ max: constants.MaxUint8 }),
            duration: randomBigNumber({
              min: BigNumber.from(1),
              max: constants.MaxUint16,
            }),
            cycleLimit: randomBigNumber({
              min: BigNumber.from(0),
              max: this.MaxCycleLimit,
            }),
            discountRate: randomBigNumber({
              max: this.MaxPercent,
            }),
            ballot: constants.AddressZero,
          },
          {
            reservedRate: randomBigNumber({ max: this.MaxPercent }),
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
        revert: 'FundingCycles::_configurable: NON_RECURRING',
      }),
  },
];
