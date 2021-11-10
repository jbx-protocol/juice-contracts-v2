/** 
  Anyone can tap funds on behalf of a project.

  When a project is tapped, it will issue the appropriate payouts to its mods, and will send
  any leftover funds to the project owner.

  Payment mods allow payouts to automatically be sent to either an address, another project on Juicebox, or a contract that inherits from IModAllocator.
*/
import { deployContract } from '../../../utils';

// The currency will be 0, which corresponds to ETH, preventing the need for currency price conversion.
const currency = 0;

export default [
  {
    description: 'Deploy first project with a payout mod',
    fn: async ({
      contracts,
      executeFn,
      BigNumber,

      randomBigNumber,
      getBalance,

      randomString,
      randomAddressFn,
      incrementProjectIdFn,
      incrementFundingCycleIdFn,
      randomSignerFn,
      randomBytes,
    }) => {
      const expectedIdOfBaseProject = incrementProjectIdFn();
      const expectedIdOfModProject = incrementProjectIdFn();

      // Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      // The owner of the project with mods.
      // Exclude the governance project's owner to make the test calculations cleaner.
      const owner = randomSignerFn({ exclude: [this.GovenanceOwner] });

      // An account that will be used to make a payment.
      const payer = randomSignerFn();

      // Two payments will be made.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue1 = randomBigNumber({
        min: BigNumber.from(1),
        max: (await getBalance(payer.address)).div(100),
      });

      // The target must at most be the payment value.
      const target = randomBigNumber({
        min: BigNumber.from(1),
        max: paymentValue1,
      });

      const duration = randomBigNumber({
        min: BigNumber.from(1),
        max: constants.MaxUint16,
      });

      // The mod percents should add up to <= this.MaxPercent.
      const percent1 = randomBigNumber({
        min: BigNumber.from(1),
        max: this.MaxModPercent.sub(2),
      });
      const percent2 = randomBigNumber({
        min: BigNumber.from(1),
        max: this.MaxModPercent.sub(percent1).sub(1),
      });
      const percent3 = randomBigNumber({
        min: BigNumber.from(1),
        max: this.MaxModPercent.sub(percent1).sub(percent2),
      });

      // There are three types of mods.
      // Address mods route payout directly to an address.
      const addressMod = {
        preferUnstaked: randomBool(),
        percent: percent1.toNumber(),
        lockedUntil: 0,
        // Make sure the beneficiary isnt the owner.
        beneficiary: randomAddressFn({
          exclude: [owner.address],
        }),
        allocator: constants.AddressZero,
        projectId: BigNumber.from(0),
      };
      // Project mods route payout directly to another project on TerminalV1.
      const projectMod = {
        preferUnstaked: randomBool(),
        percent: percent2.toNumber(),
        lockedUntil: 0,
        beneficiary: randomAddressFn(),
        allocator: constants.AddressZero,
        projectId: expectedIdOfModProject,
      };
      // Allocator mods route payments directly to the specified contract that inherits from IModAllocator.
      const allocatorMod = {
        preferUnstaked: randomBool(),
        percent: percent3.toNumber(),
        lockedUntil: 0,
        beneficiary: randomAddressFn(),
        allocator: (await deployContract('ExampleModAllocator')).address,
        projectId: BigNumber.from(0),
      };

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'deploy',
        args: [
          owner.address,
          randomBytes({
            // Make sure its unique by prepending the id.
            prepend: expectedIdOfBaseProject.toString(),
          }),
          randomString(),
          {
            target,
            currency,
            duration,
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
          [addressMod, projectMod, allocatorMod],
          [],
        ],
      });
      return {
        owner,
        payer,
        paymentValue1,
        expectedIdOfBaseProject,
        expectedIdOfModProject,
        duration,
        target,
        addressMod,
        projectMod,
        allocatorMod,
      };
    },
  },
  {
    description: 'Check that the payout mods got set',
    fn: ({
      contracts,

      timeMark,
      randomSignerFn,
      local: { expectedIdOfBaseProject, addressMod, projectMod, allocatorMod },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.modStore,
        fn: 'payoutModsOf',
        args: [expectedIdOfBaseProject, timeMark],
        expect: [
          [
            addressMod.preferUnstaked,
            addressMod.percent,
            addressMod.lockedUntil,
            addressMod.beneficiary,
            addressMod.allocator,
            addressMod.projectId,
          ],
          [
            projectMod.preferUnstaked,
            projectMod.percent,
            projectMod.lockedUntil,
            projectMod.beneficiary,
            projectMod.allocator,
            projectMod.projectId,
          ],
          [
            allocatorMod.preferUnstaked,
            allocatorMod.percent,
            allocatorMod.lockedUntil,
            allocatorMod.beneficiary,
            allocatorMod.allocator,
            allocatorMod.projectId,
          ],
        ],
      }),
  },
  {
    description: "Deploy second project that'll be sent funds by the configured project payout mod",
    fn: async ({
      contracts,
      executeFn,
      BigNumber,
      randomBytes,
      randomBigNumber,
      randomString,
      randomSignerFn,
      incrementFundingCycleIdFn,
      local: { duration, expectedIdOfModProject, owner },
    }) => {
      // Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      // The owner of the mod project.
      // exlcude the owner address and the governance owner to make the test calculations cleaner.
      const modProjectOwner = randomSignerFn({
        exclude: [owner.address, this.GovenanceOwner],
      });

      // If this funding cycle duration is too much smaller than
      // the base cycle's duration (< 1/30), the program could break because it
      // could have to apply the discount rate exponentially according to the factor in the worst case.
      // This worse case only happens when the smaller cycle isnt tapped or configured for a long while.
      const duration2 = randomBigNumber({
        min: duration < 500 ? BigNumber.from(1) : duration.div(500),
        max: constants.MaxUint16,
      });

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'deploy',
        args: [
          modProjectOwner.address,
          randomBytes({
            // Make sure its unique by prepending the id.
            prepend: expectedIdOfModProject.toString(),
          }),
          randomString(),
          {
            target: randomBigNumber(),
            currency: randomBigNumber({ max: constants.MaxUint8 }),
            duration: duration2,
            cycleLimit: randomBigNumber({
              max: this.MaxCycleLimit,
            }),
            // Make it recurring.
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

      return { modProjectOwner };
    },
  },
  {
    description: "Issue the project's tickets so that the unstaked preference can be checked",
    fn: ({
      contracts,
      executeFn,
      randomString,
      local: { modProjectOwner, expectedIdOfModProject },
    }) =>
      executeFn({
        caller: modProjectOwner,
        contract: contracts.ticketBooth,
        fn: 'issue',
        args: [
          expectedIdOfModProject,
          randomString({ canBeEmpty: false }),
          randomString({ canBeEmpty: false }),
        ],
      }),
  },
  {
    description: 'Make a payment to the project',
    fn: ({
      contracts,
      executeFn,

      randomString,
      randomAddressFn,
      local: { payer, paymentValue1, expectedIdOfBaseProject },
    }) =>
      executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedIdOfBaseProject, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue1,
      }),
  },
  {
    description: 'The second project should have no balance',
    fn: ({ contracts, BigNumber, randomSignerFn, local: { expectedIdOfModProject } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'balanceOf',
        args: [expectedIdOfModProject],
        expect: BigNumber.from(0),
      }),
  },
  {
    description: 'Tap funds for the project with payout mods',
    fn: async ({
      contracts,
      executeFn,
      randomSignerFn,
      getBalance,

      local: { target, owner, expectedIdOfBaseProject, addressMod, allocatorMod },
    }) => {
      // An amount up to the target can be tapped.
      const amountToTap = target;

      // Save the initial balances of the owner, address mod beneficiary, and the allocator mod contract.
      const ownerInitialBalance = await getBalance(owner.address);

      const addressModBeneficiaryInitialBalance = await getBalance(addressMod.beneficiary);
      const allocatorModContractInitialBalance = await getBalance(allocatorMod.allocator);

      // Save the amount of governance project tickets the owner has owner initially has.
      const initialOwnerTicketBalanceOfGovernanceProject = await contracts.ticketBooth.balanceOf(
        owner.address,
        this.GovernanceProjectId,
      );

      await executeFn({
        // Dont use the owner or address mod beneficiary or else the gas spent will mess up the calculation.
        caller: randomSignerFn({
          exclude: [addressMod.beneficiary, owner.address],
        }),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedIdOfBaseProject, amountToTap, currency, amountToTap],
      });

      return {
        amountToTap,
        addressModBeneficiaryInitialBalance,
        allocatorModContractInitialBalance,
        ownerInitialBalance,
        initialOwnerTicketBalanceOfGovernanceProject,
      };
    },
  },
  {
    description: 'Check that payout mod beneficiary has expected funds',
    fn: async ({
      contracts,
      local: { addressMod, amountToTap, addressModBeneficiaryInitialBalance },
    }) => {
      // The amount tapped takes into account any fees paid.
      const expectedAmountTapped = amountToTap
        .mul(this.MaxPercent)
        .div((await contracts.terminalV1.fee()).add(this.MaxPercent));

      await verifyBalance({
        address: addressMod.beneficiary,
        expect: addressModBeneficiaryInitialBalance.add(
          expectedAmountTapped.mul(addressMod.percent).div(this.MaxModPercent),
        ),
      });

      return { expectedAmountTapped };
    },
  },
  {
    description: 'Check that the second project now has a balance',
    fn: ({
      contracts,

      randomSignerFn,
      local: { projectMod, expectedAmountTapped, expectedIdOfModProject },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'balanceOf',
        args: [expectedIdOfModProject],
        expect: expectedAmountTapped.mul(projectMod.percent).div(this.MaxModPercent),
      }),
  },
  {
    description: 'Check that the beneficiary of the project mod got tickets',
    fn: ({
      contracts,

      randomSignerFn,
      local: { expectedIdOfModProject, projectMod, expectedAmountTapped },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [projectMod.beneficiary, expectedIdOfModProject],
        expect: expectedAmountTapped
          .mul(projectMod.percent)
          .div(this.MaxModPercent)
          .mul(this.InitialWeightMultiplier),
      }),
  },
  {
    description: 'Check for the correct number of staked tickets',
    fn: ({
      contracts,

      BigNumber,
      randomSignerFn,
      local: { expectedIdOfModProject, projectMod, expectedAmountTapped },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'stakedBalanceOf',
        args: [projectMod.beneficiary, expectedIdOfModProject],
        expect: projectMod.preferUnstaked
          ? BigNumber.from(0)
          : expectedAmountTapped
              .mul(projectMod.percent)
              .div(this.MaxModPercent)
              .mul(this.InitialWeightMultiplier),
      }),
  },
  {
    description: "Check that mod's allocator got paid",
    fn: ({ local: { allocatorMod, expectedAmountTapped, allocatorModContractInitialBalance } }) =>
      verifyBalance({
        address: allocatorMod.allocator,
        expect: allocatorModContractInitialBalance.add(
          expectedAmountTapped.mul(allocatorMod.percent).div(this.MaxModPercent),
        ),
      }),
  },
  {
    description: 'Check that the project owner got any leftovers',
    fn: ({
      local: {
        owner,
        addressMod,
        projectMod,
        allocatorMod,
        expectedAmountTapped,
        ownerInitialBalance,
      },
    }) =>
      verifyBalance({
        address: owner.address,
        expect: ownerInitialBalance.add(
          expectedAmountTapped
            .sub(expectedAmountTapped.mul(addressMod.percent).div(this.MaxModPercent))
            .sub(expectedAmountTapped.mul(projectMod.percent).div(this.MaxModPercent))
            .sub(expectedAmountTapped.mul(allocatorMod.percent).div(this.MaxModPercent)),
        ),
      }),
  },
  {
    description: "Make sure the project owner got governance's project tickets",
    fn: ({
      contracts,

      randomSignerFn,
      local: {
        owner,
        amountToTap,
        expectedAmountTapped,
        initialOwnerTicketBalanceOfGovernanceProject,
      },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [owner.address, this.GovernanceProjectId],
        expect: initialOwnerTicketBalanceOfGovernanceProject.add(
          amountToTap.sub(expectedAmountTapped).mul(this.InitialWeightMultiplier),
        ),
      }),
  },
  {
    description: "Make another payment to the project to make sure it's got overflow",
    fn: async ({
      contracts,
      executeFn,
      BigNumber,
      randomBigNumber,

      randomString,
      randomAddressFn,
      local: { payer, expectedIdOfBaseProject, target },
    }) => {
      // The second amount should cause overflow.
      const paymentValue2 = randomBigNumber({
        min: BigNumber.from(1),
        max: target,
      });
      await executeFn({
        caller: payer,
        contract: contracts.terminalV1,
        fn: 'pay',
        args: [expectedIdOfBaseProject, randomAddressFn(), randomString(), randomBool()],
        value: paymentValue2,
      });

      return { paymentValue2 };
    },
  },
  {
    description: "Shouldn't be able to tap excessive funds during the current funding cycle",
    fn: ({
      contracts,
      executeFn,
      randomSignerFn,
      local: { expectedIdOfBaseProject, paymentValue2 },
    }) =>
      executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedIdOfBaseProject, paymentValue2, currency, paymentValue2],
        revert: 'FundingCycles::tap: INSUFFICIENT_FUNDS',
      }),
  },
  {
    description: 'Fast forward to the next funding cycle',
    fn: ({ fastforwardFn, local: { duration } }) => fastforwardFn(duration.mul(86400).add(1)),
  },
  {
    description: 'Tap the full target',
    fn: async ({
      contracts,
      executeFn,
      randomSignerFn,
      incrementFundingCycleIdFn,
      local: { expectedIdOfBaseProject, paymentValue2 },
    }) => {
      // A new funding cycle will be created. Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedIdOfBaseProject, paymentValue2, currency, paymentValue2],
      });
    },
  },
];
