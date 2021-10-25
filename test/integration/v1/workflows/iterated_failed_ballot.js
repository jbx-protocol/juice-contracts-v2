/** 
  If a funding cycle ballot fails, any subsequent reconfigurations should be based on the last approved cycle.
*/
import { deployContract, constants } from '../../../utils';

// The currency will be 0, which corresponds to ETH, preventing the need for currency price conversion.
const currency = 0;

// Expect the first funding cycle to be based on the 0th funding cycle.
const expectedInitialBasedOn = 0;

export default [
  {
    description: 'Deploy a project',
    fn: async ({
      deployer,
      contracts,
      executeFn,

      randomBigNumber,
      BigNumber,
      randomBytes,
      randomString,
      randomSignerFn,
      getBalanceFn,
      incrementFundingCycleIdFn,
      incrementProjectIdFn,
    }) => {
      const expectedProjectId = incrementProjectIdFn();
      const expectedFundingCycleId1 = incrementFundingCycleIdFn();

      // It should be the project's first budget.
      const expectedFundingCycleNumber1 = BigNumber.from(1);

      // The owner of the project that will reconfigure with a ballot.
      const owner = randomSignerFn();

      // Use a ballot that fails exactly halfway through its duration.
      const ballot = await deployContract('ExampleFailingFundingCycleBallot');

      // The duration of the funding cycle should be less than the ballot duration
      const duration1 = randomBigNumber({
        // Fails after half.
        min: (await ballot.duration()).div(86400).div(2),
        // The ballot duration is in seconds, but duration is in days.
        max: (await ballot.duration()).div(86400).sub(1),
      });

      // Make this zero to make test cases cleaner.
      const cycleLimit1 = BigNumber.from(0);

      // An account that will be used to make payments.
      const payer = randomSignerFn();

      // At the end of the tests, this amount will be attempted to be tapped.
      const amountToTap = BigNumber.from(1);

      // One payment will be made. Cant pay entire balance because some is needed for gas.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue = randomBigNumber({
        // Make sure the target is arbitrarily larger than the amount that will be tapped, included fees that will be incurred.
        min: amountToTap.mul(3),
        max: (await getBalanceFn(payer.address)).div(100),
      });

      // The target of the first funding cycle should be the same as the payment value.
      const target1 = paymentValue;

      // make recurring.
      const discountRate1 = randomBigNumber({
        max: constants.MaxPercent,
      });

      const reservedRate1 = randomBigNumber({ max: constants.MaxPercent });
      const bondingCurveRate1 = randomBigNumber({
        max: constants.MaxPercent,
      });
      const reconfigurationBondingCurveRate1 = randomBigNumber({
        max: constants.MaxPercent,
      });

      await executeFn({
        caller: deployer,
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
            ballot: ballot.address,
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
        ballot,
        cycleLimit1,
        duration1,
        discountRate1,
        target1,
        reconfigurationBondingCurveRate1,
        bondingCurveRate1,
        reservedRate1,
        payer,
        paymentValue,
        amountToTap,
      };
    },
  },
  {
    description: 'Make a payment to the project to lock in the current configuration',
    fn: async ({
      contracts,
      executeFn,
      randomString,
      randomAddressFn,

      timeMark,
      local: { expectedProjectId, payer, paymentValue },
    }) => {
      await executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedProjectId, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue,
      });
      return { originalTimeMark: timeMark };
    },
  },
  {
    description: 'The funding cycle ballot state should be in standby',
    fn: ({ contracts, randomSignerFn, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentBallotStateOf',
        args: [expectedProjectId],
        expect: 3,
      }),
  },
  {
    description: 'Reconfiguring should create a new funding cycle',
    fn: async ({
      contracts,
      executeFn,
      randomBigNumber,
      BigNumber,
      incrementFundingCycleIdFn,
      local: { expectedProjectId, owner },
    }) => {
      const expectedFundingCycleId2 = incrementFundingCycleIdFn();

      // The next funding cycle should be the second.
      const expectedFundingCycleNumber2 = BigNumber.from(2);

      const target2 = randomBigNumber();

      const currency2 = randomBigNumber({ max: constants.MaxUint8 });
      const duration2 = randomBigNumber({
        min: BigNumber.from(1),
        max: constants.MaxUint16,
      });

      // Make this zero to make test cases cleaner.
      const cycleLimit2 = BigNumber.from(0);

      // make recurring.
      const discountRate2 = randomBigNumber({
        max: constants.MaxPercent,
      });
      const ballot2 = constants.AddressZero;
      const reservedRate2 = randomBigNumber({ max: constants.MaxPercent });
      const bondingCurveRate2 = randomBigNumber({
        max: constants.MaxPercent,
      });
      const reconfigurationBondingCurveRate2 = randomBigNumber({
        max: constants.MaxPercent,
      });
      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            target: target2,
            currency: currency2,
            duration: duration2,
            cycleLimit: cycleLimit2,
            discountRate: discountRate2,
            ballot: ballot2,
          },
          {
            reservedRate: reservedRate2,
            bondingCurveRate: bondingCurveRate2,
            reconfigurationBondingCurveRate: reconfigurationBondingCurveRate2,
          },
          [],
          [],
        ],
      });
      return {
        expectedFundingCycleId2,
        expectedFundingCycleNumber2,
        cycleLimit2,
        target2,
        ballot2,
        duration2,
        currency2,
        discountRate2,
        reconfigurationBondingCurveRate2,
        bondingCurveRate2,
        reservedRate2,
      };
    },
  },
  {
    description: 'The funding cycle ballot state should be active',
    fn: ({ contracts, randomSignerFn, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentBallotStateOf',
        args: [expectedProjectId],
        expect: 1,
      }),
  },
  {
    description: 'The queued funding cycle should have the reconfiguration',
    fn: async ({
      contracts,

      BigNumber,
      randomSignerFn,
      timeMark,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleId2,
        expectedFundingCycleNumber1,
        originalTimeMark,
        duration1,
        ballot,
        discountRate1,
        cycleLimit2,
        target2,
        ballot2,
        duration2,
        currency2,
        discountRate2,
        reconfigurationBondingCurveRate2,
        bondingCurveRate2,
        reservedRate2,
      },
    }) => {
      // This is how many cycles can pass while the ballot is active and waiting for approval.
      const cycleCountDuringBallot = (await ballot.duration()).div(86400).div(duration1);

      let expectedPackedMetadata2 = BigNumber.from(0);
      expectedPackedMetadata2 = expectedPackedMetadata2.add(reconfigurationBondingCurveRate2);
      expectedPackedMetadata2 = expectedPackedMetadata2.shl(8);
      expectedPackedMetadata2 = expectedPackedMetadata2.add(bondingCurveRate2);
      expectedPackedMetadata2 = expectedPackedMetadata2.shl(8);
      expectedPackedMetadata2 = expectedPackedMetadata2.add(reservedRate2);
      expectedPackedMetadata2 = expectedPackedMetadata2.shl(8);

      // Expect the funding cycle's weight to be the base weight.
      const expectedInititalWeight = await contracts.fundingCycles.BASE_WEIGHT();

      // Expect the funding cycle's fee to be the terminalV1's fee.
      const expectedFee = await contracts.terminalV1.fee();

      let expectedPostBallotWeight = expectedInititalWeight;
      for (let i = 0; i < cycleCountDuringBallot.add(1); i += 1) {
        expectedPostBallotWeight = expectedPostBallotWeight
          .mul(constants.DiscountRatePercentDenominator.sub(discountRate1))
          .div(constants.DiscountRatePercentDenominator);
      }

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'queuedOf',
        args: [expectedProjectId],
        expect: [
          expectedFundingCycleId2,
          expectedProjectId,
          expectedFundingCycleNumber1.add(cycleCountDuringBallot).add(1),
          expectedFundingCycleId1,
          timeMark,
          cycleLimit2,
          expectedPostBallotWeight,
          ballot2,
          // The start time should be two duration after the initial start.
          originalTimeMark.add(duration1.mul(86400).mul(cycleCountDuringBallot.add(1))),
          duration2,
          target2,
          currency2,
          expectedFee,
          discountRate2,
          BigNumber.from(0),
          expectedPackedMetadata2,
        ],
      });

      return {
        reconfigurationTimeMark: timeMark,
        cycleCountDuringBallot,
        expectedPackedMetadata2,
        expectedInititalWeight,
        expectedPostBallotWeight,
        expectedFee,
      };
    },
  },
  {
    description: 'Tap some of the current funding cycle',
    fn: async ({
      randomSignerFn,
      contracts,
      executeFn,
      local: { expectedProjectId, amountToTap },
    }) =>
      executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedProjectId, amountToTap, currency, 0],
      }),
  },
  {
    description: 'The current funding cycle should have the first configuration with some tapped',
    fn: async ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        originalTimeMark,
        amountToTap,
        ballot,
        cycleLimit1,
        duration1,
        target1,
        discountRate1,
        reconfigurationBondingCurveRate1,
        bondingCurveRate1,
        reservedRate1,
        expectedFee,
        expectedInititalWeight,
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

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentOf',
        args: [expectedProjectId],
        expect: [
          expectedFundingCycleId1,
          expectedProjectId,
          expectedFundingCycleNumber1,
          BigNumber.from(expectedInitialBasedOn),
          originalTimeMark,
          cycleLimit1,
          expectedInititalWeight,
          ballot.address,
          originalTimeMark,
          duration1,
          target1,
          BigNumber.from(currency),
          expectedFee,
          discountRate1,
          amountToTap,
          expectedPackedMetadata1,
        ],
      });
      return { expectedPackedMetadata1 };
    },
  },
  {
    description: 'The funding cycle ballot state should still be active',
    fn: ({ contracts, randomSignerFn, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentBallotStateOf',
        args: [expectedProjectId],
        expect: 1,
      }),
  },
  {
    description: 'Fastforward to the end of the funding cycle',
    fn: ({ fastforwardFn, local: { duration1 } }) => fastforwardFn(duration1.mul(86400)),
  },
  {
    description: 'The funding cycle ballot state should be failed',
    fn: ({ contracts, randomSignerFn, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentBallotStateOf',
        args: [expectedProjectId],
        expect: 2,
      }),
  },
  {
    description:
      'The current funding cycle should have a new funding cycle of the first configuration',
    fn: ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber2,
        originalTimeMark,
        ballot,
        cycleLimit1,
        duration1,
        discountRate1,
        target1,
        expectedPackedMetadata1,
        expectedFee,
        expectedInititalWeight,
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
          expectedFundingCycleNumber2,
          expectedFundingCycleId1,
          originalTimeMark,
          // The cycle limit should be one lower than the previous.
          cycleLimit1.eq(0) ? BigNumber.from(0) : cycleLimit1.sub(1),
          expectedInititalWeight
            .mul(constants.DiscountRatePercentDenominator.sub(discountRate1))
            .div(constants.DiscountRatePercentDenominator),
          ballot.address,
          // The start time should be one duration after the initial start.
          originalTimeMark.add(duration1.mul(86400)),
          duration1,
          target1,
          BigNumber.from(currency),
          expectedFee,
          discountRate1,
          BigNumber.from(0),
          expectedPackedMetadata1,
        ],
      }),
  },
  {
    description: 'Fast forward to the end of ballot duration.',
    fn: async ({
      fastforwardFn,
      randomBigNumber,
      BigNumber,
      local: { cycleCountDuringBallot, duration1 },
    }) =>
      // Add random padding to comfortably fit the fast forward within the next cycle.
      fastforwardFn(
        duration1
          .mul(cycleCountDuringBallot)
          .mul(86400)
          .add(
            randomBigNumber({
              min: BigNumber.from(3),
              max: BigNumber.from(84397),
            }),
          ),
      ),
  },
  {
    description: 'The funding cycle ballot state should still be failed',
    fn: ({ contracts, randomSignerFn, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentBallotStateOf',
        args: [expectedProjectId],
        expect: 2,
      }),
  },
  {
    description: 'Reconfiguring should create a new funding cycle that should obide by the ballot',
    fn: async ({
      contracts,
      executeFn,
      incrementFundingCycleIdFn,
      local: {
        expectedProjectId,
        owner,
        target2,
        currency2,
        duration2,
        cycleLimit2,
        discountRate2,
        ballot2,
        reservedRate2,
        bondingCurveRate2,
        reconfigurationBondingCurveRate2,
      },
    }) => {
      const expectedFundingCycleId3 = incrementFundingCycleIdFn();

      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            target: target2,
            currency: currency2,
            duration: duration2,
            cycleLimit: cycleLimit2,
            discountRate: discountRate2,
            ballot: ballot2,
          },
          {
            reservedRate: reservedRate2,
            bondingCurveRate: bondingCurveRate2,
            reconfigurationBondingCurveRate: reconfigurationBondingCurveRate2,
          },
          [],
          [],
        ],
      });
      return {
        expectedFundingCycleId3,
      };
    },
  },
  {
    description: 'The funding cycle ballot state should be active',
    fn: async ({ contracts, randomSignerFn, timeMark, local: { expectedProjectId } }) => {
      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'currentBallotStateOf',
        args: [expectedProjectId],
        expect: 1,
      });
      return { secondReconfigurationTimeMark: timeMark };
    },
  },
  {
    description: 'The current funding cycle should not have the reconfiguration',
    fn: ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        cycleCountDuringBallot,
        originalTimeMark,
        duration1,
        cycleLimit1,
        ballot,
        target1,
        discountRate1,
        expectedPackedMetadata1,
        expectedPostBallotWeight,
        expectedFee,
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
          expectedFundingCycleNumber1.add(cycleCountDuringBallot).add(1),
          expectedFundingCycleId1,
          originalTimeMark,
          cycleLimit1.eq(0) || cycleCountDuringBallot.add(1).gt(cycleLimit1)
            ? BigNumber.from(0)
            : cycleLimit1.sub(cycleCountDuringBallot.add(1)),
          expectedPostBallotWeight,
          ballot.address,
          originalTimeMark.add(duration1.mul(86400).mul(cycleCountDuringBallot.add(1))),
          duration1,
          target1,
          BigNumber.from(currency),
          expectedFee,
          discountRate1,
          BigNumber.from(0),
          expectedPackedMetadata1,
        ],
      }),
  },
  {
    description: 'The queued funding cycle should have the reconfiguration',
    fn: async ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: {
        expectedProjectId,
        expectedFundingCycleId1,
        expectedFundingCycleNumber1,
        cycleCountDuringBallot,
        originalTimeMark,
        duration2,
        duration1,
        cycleLimit2,
        ballot2,
        target2,
        discountRate1,
        discountRate2,
        currency2,
        expectedPackedMetadata2,
        secondReconfigurationTimeMark,
        expectedPostBallotWeight,
        expectedFee,
        expectedFundingCycleId3,
      },
    }) => {
      let expectedPostDoubleBallotWeight = expectedPostBallotWeight;
      for (let i = 0; i < cycleCountDuringBallot.add(1); i += 1) {
        expectedPostDoubleBallotWeight = expectedPostDoubleBallotWeight
          .mul(constants.DiscountRatePercentDenominator.sub(discountRate1))
          .div(constants.DiscountRatePercentDenominator);
      }
      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.fundingCycles,
        fn: 'queuedOf',
        args: [expectedProjectId],
        expect: [
          expectedFundingCycleId3,
          expectedProjectId,
          expectedFundingCycleNumber1
            .add(cycleCountDuringBallot)
            .add(1)
            .add(cycleCountDuringBallot)
            .add(1),
          expectedFundingCycleId1,
          secondReconfigurationTimeMark,
          cycleLimit2,
          // one before.
          expectedPostDoubleBallotWeight,
          ballot2,
          originalTimeMark.add(duration1.mul(86400).mul(cycleCountDuringBallot.add(1)).mul(2)),
          duration2,
          target2,
          currency2,
          expectedFee,
          discountRate2,
          BigNumber.from(0),
          expectedPackedMetadata2,
        ],
      });
    },
  },
];
