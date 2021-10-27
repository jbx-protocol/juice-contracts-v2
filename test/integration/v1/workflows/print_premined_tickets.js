/** 
  A project can print premined tickets up until the point when a payment is made to it after its configured its first funding cycle.
*/
import { constants } from '../../../utils';

// The currency will be 0, which corresponds to ETH.
const currency = 0;

export default [
  {
    description: 'Create a project',
    fn: async ({
      executeFn,
      randomString,
      contracts,
      randomBytes,
      randomSignerFn,
      incrementProjectIdFn,
    }) => {
      const expectedProjectId = incrementProjectIdFn();

      // The owner of the project that will reconfigure.
      const owner = randomSignerFn();

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'create',
        args: [
          owner.address,
          randomBytes({
            // Make sure its unique by prepending the id.
            prepend: expectedProjectId.toString(),
          }),
          randomString(),
          contracts.terminalV1.address,
        ],
      });

      return { owner, expectedProjectId };
    },
  },
  {
    description: 'The project should still be able to print premined tickets',
    fn: ({ randomSignerFn, contracts, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'canPrintPreminedTickets',
        args: [expectedProjectId],
        expect: true,
      }),
  },
  {
    description: 'Print some premined tickets',
    fn: async ({
      randomSignerFn,

      randomBigNumber,
      BigNumber,
      executeFn,
      contracts,
      randomString,
      local: { owner, expectedProjectId },
    }) => {
      // The address that will receive the first batch of preconfigure tickets.
      const preconfigureTicketBeneficiary1 = randomSignerFn();

      // The first amount of premined tickets to print.
      const preminePrintAmount1 = randomBigNumber({
        min: BigNumber.from(1),
        // Use an arbitrary large big number that can be added to other large big numbers without risk of running into uint256 boundaries.
        max: BigNumber.from(10).pow(30),
      });

      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'printPreminedTickets',
        args: [
          expectedProjectId,
          preminePrintAmount1,
          currency,
          preconfigureTicketBeneficiary1.address,
          randomString(),
          randomBool(),
        ],
      });

      return {
        preconfigureTicketBeneficiary1,
        preminePrintAmount1,
      };
    },
  },
  {
    description: 'The beneficiary should have gotten the correct amount of tickets',
    fn: async ({
      randomSignerFn,

      contracts,
      local: { preconfigureTicketBeneficiary1, preminePrintAmount1, expectedProjectId },
    }) => {
      // The ticket amount is based on the initial funding cycle's weight.
      const expectedPreminedPrintedTicketAmount1 = preminePrintAmount1.mul(
        this.InitialWeightMultiplier,
      );
      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [preconfigureTicketBeneficiary1.address, expectedProjectId],
        expect: expectedPreminedPrintedTicketAmount1,
      });

      return { expectedPreminedPrintedTicketAmount1 };
    },
  },
  {
    description: 'All the tickets should be staked',
    fn: ({
      randomSignerFn,

      contracts,
      local: {
        expectedProjectId,
        preconfigureTicketBeneficiary1,
        expectedPreminedPrintedTicketAmount1,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'stakedBalanceOf',
        args: [preconfigureTicketBeneficiary1.address, expectedProjectId],
        expect: expectedPreminedPrintedTicketAmount1,
      }),
  },
  {
    description: 'The project should still be allowed to print more premined tickets',
    fn: ({ randomSignerFn, contracts, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'canPrintPreminedTickets',
        args: [expectedProjectId],
        expect: true,
      }),
  },
  {
    description: 'Make a payment before configuring a funding cycle',
    fn: async ({
      randomSignerFn,
      randomBigNumber,
      BigNumber,
      getBalanceFn,
      executeFn,
      contracts,
      randomString,

      local: { expectedProjectId },
    }) => {
      // An account that will be used to make payments.
      const payer = randomSignerFn();

      // One payment will be made. Cant pay entire balance because some is needed for gas.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue1 = randomBigNumber({
        min: BigNumber.from(1),
        max: (await getBalanceFn(payer.address)).div(100),
      });

      // The address that will receive the second batch of preconfigure tickets.
      const preconfigureTicketBeneficiary2 = randomSignerFn();

      await executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [
          expectedProjectId,
          preconfigureTicketBeneficiary2.address,
          randomString(),
          randomBool(),
        ],
        value: paymentValue1,
      });

      return {
        payer,
        paymentValue1,
        preconfigureTicketBeneficiary2,
      };
    },
  },
  {
    description: 'The payment beneficiary should have gotten the correct amount of tickets',
    fn: async ({
      randomSignerFn,

      contracts,
      local: {
        preconfigureTicketBeneficiary1,
        preconfigureTicketBeneficiary2,
        expectedPreminedPrintedTicketAmount1,
        expectedProjectId,
        paymentValue1,
      },
    }) => {
      // The ticket amount is based on the initial funding cycle's weight.
      const expectedPaymentPrintedTicketAmount1 = paymentValue1.mul(this.InitialWeightMultiplier);
      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [preconfigureTicketBeneficiary2.address, expectedProjectId],
        // If the beneficiaries receiving the first premine tickets and the first payment tickets are the same, add them up.
        expect: expectedPaymentPrintedTicketAmount1.add(
          preconfigureTicketBeneficiary2.address === preconfigureTicketBeneficiary1.address
            ? expectedPreminedPrintedTicketAmount1
            : 0,
        ),
      });
      return { expectedPaymentPrintedTicketAmount1 };
    },
  },
  {
    description: 'All the tickets should still be staked',
    fn: ({
      randomSignerFn,

      contracts,
      local: {
        expectedProjectId,
        preconfigureTicketBeneficiary1,
        preconfigureTicketBeneficiary2,
        expectedPaymentPrintedTicketAmount1,
        expectedPreminedPrintedTicketAmount1,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'stakedBalanceOf',
        args: [preconfigureTicketBeneficiary2.address, expectedProjectId],
        expect: expectedPaymentPrintedTicketAmount1.add(
          preconfigureTicketBeneficiary2.address === preconfigureTicketBeneficiary1.address
            ? expectedPreminedPrintedTicketAmount1
            : 0,
        ),
      }),
  },
  {
    description: 'The project should still be able to print more premined tickets',
    fn: ({ randomSignerFn, contracts, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'canPrintPreminedTickets',
        args: [expectedProjectId],
        expect: true,
      }),
  },
  {
    description: "Issue the project's tickets so that the unstaked preference can be checked",
    fn: ({ executeFn, contracts, randomString, local: { expectedProjectId, owner } }) =>
      executeFn({
        caller: owner,
        contract: contracts.ticketBooth,
        fn: 'issue',
        args: [
          expectedProjectId,
          randomString({ canBeEmpty: false }),
          randomString({ canBeEmpty: false }),
        ],
      }),
  },
  {
    description:
      "Configuring a funding cycle. This shouldn't affect the ability for project to keep printing premined tickets",
    fn: async ({
      executeFn,
      contracts,
      randomBigNumber,
      BigNumber,
      incrementFundingCycleIdFn,
      local: { expectedProjectId, owner },
    }) => {
      // Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      await executeFn({
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
              max: this.MaxCycleLimit,
            }),
            discountRate: randomBigNumber({ max: this.MaxPercent }),
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
      });
    },
  },
  {
    description: 'Print some more premined tickets to another beneficiary',
    fn: async ({
      randomBigNumber,
      executeFn,
      BigNumber,

      randomSignerFn,
      randomString,
      contracts,
      local: { expectedProjectId, owner },
    }) => {
      // The address that will receive the second batch of premined tickets.
      const preconfigureTicketBeneficiary3 = randomSignerFn();

      const preminePrintAmount2 = randomBigNumber({
        min: BigNumber.from(1),
        // Use an arbitrary large big number that can be added to other large big numbers without risk of running into uint256 boundaries.
        max: BigNumber.from(10).pow(30),
      });

      // The unsrtaked preference to use.
      const preferUnstakedTickets = randomBool();

      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'printPreminedTickets',
        args: [
          expectedProjectId,
          preminePrintAmount2,
          currency,
          preconfigureTicketBeneficiary3.address,
          randomString(),
          preferUnstakedTickets,
        ],
      });

      return {
        preconfigureTicketBeneficiary3,
        preminePrintAmount2,
        preferUnstakedTickets,
      };
    },
  },
  {
    description: 'The third beneficiary should have gotten the correct amount of tickets',
    fn: async ({
      randomSignerFn,

      contracts,
      local: {
        expectedProjectId,
        preconfigureTicketBeneficiary1,
        preconfigureTicketBeneficiary2,
        preconfigureTicketBeneficiary3,
        expectedPaymentPrintedTicketAmount1,
        expectedPreminedPrintedTicketAmount1,
        preminePrintAmount2,
      },
    }) => {
      const expectedPreminedPrintedTicketAmount2 = preminePrintAmount2.mul(
        this.InitialWeightMultiplier,
      );

      let expect = expectedPreminedPrintedTicketAmount2;

      // If the beneficiary is the same as the one which received tickets from the first premine, add the amounts.
      if (preconfigureTicketBeneficiary3.address === preconfigureTicketBeneficiary1.address)
        expect = expect.add(expectedPreminedPrintedTicketAmount1);

      // If the beneficiary is the same as the one which received tickets from the first payment, add the amounts.
      if (preconfigureTicketBeneficiary3.address === preconfigureTicketBeneficiary2.address)
        expect = expect.add(expectedPaymentPrintedTicketAmount1);

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [preconfigureTicketBeneficiary3.address, expectedProjectId],
        expect,
      });

      return { expectedPreminedPrintedTicketAmount2 };
    },
  },
  {
    description: 'Check for the correct number of staked tickets',
    fn: async ({
      randomSignerFn,

      contracts,
      BigNumber,
      local: {
        expectedProjectId,
        preconfigureTicketBeneficiary1,
        preconfigureTicketBeneficiary2,
        preconfigureTicketBeneficiary3,
        expectedPreminedPrintedTicketAmount1,
        expectedPreminedPrintedTicketAmount2,
        expectedPaymentPrintedTicketAmount1,
        preferUnstakedTickets,
      },
    }) => {
      let expectedStaked = preferUnstakedTickets
        ? BigNumber.from(0)
        : expectedPreminedPrintedTicketAmount2;

      // If the beneficiary is the same as the one which received tickets from the first premine, add the amounts.
      if (preconfigureTicketBeneficiary3.address === preconfigureTicketBeneficiary1.address)
        expectedStaked = expectedStaked.add(expectedPreminedPrintedTicketAmount1);

      // If the beneficiary is the same as the one which received tickets from the first payment, add the amounts.
      if (preconfigureTicketBeneficiary3.address === preconfigureTicketBeneficiary2.address)
        expectedStaked = expectedStaked.add(expectedPaymentPrintedTicketAmount1);

      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'stakedBalanceOf',
        args: [preconfigureTicketBeneficiary3.address, expectedProjectId],
        expect: expectedStaked,
      });
    },
  },
  {
    description:
      'The total supply of tickets for the project should equal the total of the premined printed amounts',
    fn: ({
      randomSignerFn,

      contracts,
      local: {
        expectedProjectId,
        expectedPreminedPrintedTicketAmount1,
        expectedPreminedPrintedTicketAmount2,
        expectedPaymentPrintedTicketAmount1,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'totalSupplyOf',
        args: [expectedProjectId],
        expect: expectedPreminedPrintedTicketAmount1
          .add(expectedPreminedPrintedTicketAmount2)
          .add(expectedPaymentPrintedTicketAmount1),
      }),
  },
  {
    description:
      "Make a second payment to lock in the premined amount now that there's a configured funding cycle",
    fn: async ({
      randomBigNumber,
      BigNumber,
      getBalanceFn,
      executeFn,
      contracts,
      randomAddressFn,
      randomString,

      local: { expectedProjectId, payer },
    }) => {
      // One payment will be made. Cant pay entire balance because some is needed for gas.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue2 = randomBigNumber({
        min: BigNumber.from(1),
        max: (await getBalanceFn(payer.address)).div(100),
      });

      await executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedProjectId, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue2,
      });
    },
  },
  {
    description: 'Printing tickets should no longer allowed',
    fn: ({ randomSignerFn, contracts, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'canPrintPreminedTickets',
        args: [expectedProjectId],
        expect: false,
      }),
  },
  {
    description: 'Confirm that printing tickets is no longer allowed',
    fn: async ({
      executeFn,
      contracts,
      randomBigNumber,
      randomString,
      randomAddressFn,

      BigNumber,
      local: { owner, expectedProjectId },
    }) =>
      executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'printPreminedTickets',
        args: [
          expectedProjectId,
          randomBigNumber({
            min: BigNumber.from(1),
            // Use an arbitrary large big number that can be added to other large big numbers without risk of running into uint256 boundaries.
            max: BigNumber.from(10).pow(30),
          }),
          currency,
          randomAddressFn(),
          randomString(),
          randomBool(),
        ],
        revert: 'TerminalV1::printTickets: ALREADY_ACTIVE',
      }),
  },
];
