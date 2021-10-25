/** 
  Project's can set ticket mods, which allow reserved tickets to be automatically sent to an address.

  A ticket mod can be locked until a specified timestamp, which prevents it from being removed while
  the current funding cycle configuration is active. 

  If a project reconfigures its funding cycle, new mods can be set that override any locked payout mods.
  These new mods will take effect once the reconfigured funding cycle becomes active.
*/
import { constants } from '../../../utils';
export default [
  {
    description: 'Deploy first project with at least a locked ticket mod',
    fn: async ({
      contracts,
      executeFn,
      BigNumber,
      randomBigNumber,
      randomBytes,
      getTimestampFn,

      randomString,
      randomAddressFn,
      randomSignerFn,
      incrementProjectIdFn,
      incrementFundingCycleIdFn,
    }) => {
      const expectedProjectId = incrementProjectIdFn();

      // Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      // The owner of the project with mods.
      const owner = randomSignerFn();

      // Ticket mods can be locked.
      const lockedMod = {
        preferUnstaked: randomBool(),
        // Arbitrary percent that adds up to <= 100% across all mods.
        percent: randomBigNumber({
          min: BigNumber.from(1),
          max: constants.MaxModPercent.div(2),
        }).toNumber(),
        // Lock at least until the end of the tests.
        lockedUntil: (await getTimestampFn())
          .add(
            randomBigNumber({
              min: BigNumber.from(1000),
              max: BigNumber.from(100000000),
            }),
          )
          .toNumber(),
        beneficiary: randomAddressFn(),
      };
      const unlockedMod1 = {
        preferUnstaked: randomBool(),
        // Arbitrary percent that adds up to <= 100% across all mods.
        percent: randomBigNumber({
          min: BigNumber.from(1),
          max: constants.MaxModPercent.div(4),
        }).toNumber(),
        lockedUntil: 0,
        beneficiary: randomAddressFn(),
      };
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
            target: randomBigNumber(),
            currency: randomBigNumber({ max: constants.MaxUint8 }),
            duration: randomBigNumber({
              min: BigNumber.from(1),
              max: constants.MaxUint16,
            }),
            cycleLimit: randomBigNumber({
              max: constants.MaxCycleLimit,
            }),
            discountRate: randomBigNumber({ max: constants.MaxPercent }),
            ballot: constants.AddressZero,
          },
          {
            reservedRate: BigNumber.from(0),
            bondingCurveRate: randomBigNumber({
              max: constants.MaxPercent,
            }),
            reconfigurationBondingCurveRate: randomBigNumber({
              max: constants.MaxPercent,
            }),
          },
          [],
          [lockedMod, unlockedMod1],
        ],
      });
      return { owner, expectedProjectId, lockedMod, unlockedMod1 };
    },
  },
  {
    description: 'Check that the ticket mods got set',
    fn: async ({
      contracts,

      randomSignerFn,
      timeMark,
      local: { expectedProjectId, lockedMod, unlockedMod1 },
    }) => {
      await verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.modStore,
        fn: 'ticketModsOf',
        args: [expectedProjectId, timeMark],
        expect: [
          [
            lockedMod.preferUnstaked,
            lockedMod.percent,
            lockedMod.lockedUntil,
            lockedMod.beneficiary,
          ],
          [
            unlockedMod1.preferUnstaked,
            unlockedMod1.percent,
            unlockedMod1.lockedUntil,
            unlockedMod1.beneficiary,
          ],
        ],
      });
      return { configurationTimeMark: timeMark };
    },
  },
  {
    description: "Overriding a locked mod shouldn't work when setting ticket mods",
    fn: async ({
      contracts,
      executeFn,

      randomAddressFn,
      timeMark,
      randomBigNumber,
      BigNumber,
      local: { owner, expectedProjectId, unlockedMod1 },
    }) => {
      // Arbitrary percent that adds up to <= 100% across all mods.
      const unlockedMod2 = {
        preferUnstaked: randomBool(),
        percent: randomBigNumber({
          min: BigNumber.from(1),
          max: constants.MaxModPercent.div(5),
        }).toNumber(),
        lockedUntil: 0,
        beneficiary: randomAddressFn(),
      };
      await executeFn({
        caller: owner,
        contract: contracts.modStore,
        fn: 'setTicketMods',
        args: [expectedProjectId, timeMark, [unlockedMod1, unlockedMod2]],
        revert: 'ModStore::setTicketMods: SOME_LOCKED',
      });
      return { unlockedMod2 };
    },
  },
  {
    description:
      "Overriding a locked mod with a shorter locked date shouldn't work when setting ticket mods",
    fn: ({
      contracts,
      executeFn,
      timeMark,
      local: { owner, expectedProjectId, lockedMod, unlockedMod1, unlockedMod2 },
    }) =>
      executeFn({
        caller: owner,
        contract: contracts.modStore,
        fn: 'setTicketMods',
        args: [
          expectedProjectId,
          timeMark,
          [
            {
              ...lockedMod,
              lockedUntil: lockedMod.lockedUntil - 1,
            },
            unlockedMod1,
            unlockedMod2,
          ],
        ],
        revert: 'ModStore::setTicketMods: SOME_LOCKED',
      }),
  },
  {
    description: 'Set new ticket mods, making sure to include any locked mods',
    fn: ({
      contracts,
      executeFn,
      timeMark,
      local: { owner, expectedProjectId, lockedMod, unlockedMod2 },
    }) =>
      executeFn({
        caller: owner,
        contract: contracts.modStore,
        fn: 'setTicketMods',
        args: [
          expectedProjectId,
          timeMark,
          [
            {
              ...lockedMod,
              lockedUntil: lockedMod.lockedUntil + 1,
            },
            unlockedMod2,
          ],
        ],
      }),
  },
  {
    description: 'Check that the new payout mods got set correctly',
    fn: ({
      contracts,

      randomSignerFn,
      local: { expectedProjectId, lockedMod, unlockedMod2, configurationTimeMark },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.modStore,
        fn: 'ticketModsOf',
        // Subtract 1 from timeMark to get the time of the configuration execution.
        args: [expectedProjectId, configurationTimeMark],
        expect: [
          [
            lockedMod.preferUnstaked,
            lockedMod.percent,
            lockedMod.lockedUntil + 1,
            lockedMod.beneficiary,
          ],
          [
            unlockedMod2.preferUnstaked,
            unlockedMod2.percent,
            unlockedMod2.lockedUntil,
            unlockedMod2.beneficiary,
          ],
        ],
      }),
  },
  {
    description:
      'Configuring a project should allow overriding locked mods for the new configuration',
    fn: ({
      contracts,
      executeFn,
      BigNumber,
      randomBigNumber,
      local: { owner, expectedProjectId, unlockedMod1 },
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
              max: constants.MaxCycleLimit,
            }),
            discountRate: randomBigNumber({ max: constants.MaxPercent }),
            ballot: constants.AddressZero,
          },
          {
            reservedRate: BigNumber.from(0),
            bondingCurveRate: randomBigNumber({
              max: constants.MaxPercent,
            }),
            reconfigurationBondingCurveRate: randomBigNumber({
              max: constants.MaxPercent,
            }),
          },
          [],
          [unlockedMod1],
        ],
      }),
  },
  {
    description: 'Check that the new configuration has its mods',
    fn: ({
      contracts,

      randomSignerFn,
      timeMark,
      local: { expectedProjectId, unlockedMod1 },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.modStore,
        fn: 'ticketModsOf',
        args: [expectedProjectId, timeMark],
        expect: [
          [
            unlockedMod1.preferUnstaked,
            unlockedMod1.percent,
            unlockedMod1.lockedUntil,
            unlockedMod1.beneficiary,
          ],
        ],
      }),
  },
  {
    description: 'Check that the old configuration still has its mods',
    fn: ({
      contracts,

      randomSignerFn,
      local: { expectedProjectId, lockedMod, unlockedMod2, configurationTimeMark },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.modStore,
        fn: 'ticketModsOf',
        // Subtract 2 from timeMark to get the time of the configuration execution.
        args: [expectedProjectId, configurationTimeMark],
        expect: [
          [
            lockedMod.preferUnstaked,
            lockedMod.percent,
            lockedMod.lockedUntil + 1,
            lockedMod.beneficiary,
          ],
          [
            unlockedMod2.preferUnstaked,
            unlockedMod2.percent,
            unlockedMod2.lockedUntil,
            unlockedMod2.beneficiary,
          ],
        ],
      }),
  },
];
