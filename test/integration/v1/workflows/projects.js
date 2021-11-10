/** 
  Projects can be created independently from the TerminalV1 `deploy` mechanism.
  Each project can set a URI that should be a IPFS CID, and a unique handle.

  Unique handles can be transfered between accounts.

  A created project can make use all TerminalV1 functionality as normal.
*/
import {
  constants,
  randomBool,
  randomBigNumber,
  randomBytes,
  randomString,
  verifyContractGetter,
} from '../../../utils';

export default [
  {
    description: 'Create a project',
    fn: async ({ deployer, contracts, executeFn, randomSignerFn, incrementProjectIdFn }) => {
      // The address that will own a project.
      const owner = randomSignerFn();

      // Use the terminalV1 as the terminal.
      const terminal = contracts.terminalV1.address;

      const expectedProjectId = incrementProjectIdFn();

      // Make sure its unique by prepending the id.
      const handle = randomBytes({ prepend: expectedProjectId.toString() });

      const uri = randomString();

      await executeFn({
        caller: deployer,
        contract: contracts.projects,
        fn: 'create',
        args: [owner.address, handle, uri, terminal],
      });

      return { owner, terminal, handle, uri, expectedProjectId };
    },
  },
  {
    description: "Make sure the project's handle got saved",
    fn: async ({ contracts, randomSignerFn, local: { handle, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'handleOf',
        args: [expectedProjectId],
        expect: handle,
      }),
  },
  {
    description: 'Make sure the project was saved to the handle',
    fn: ({ contracts, randomSignerFn, local: { handle, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [handle],
        expect: expectedProjectId,
      }),
  },
  {
    description: "Make sure the project's uri got saved",
    fn: ({ contracts, randomSignerFn, local: { uri, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'uriOf',
        args: [expectedProjectId],
        expect: uri,
      }),
  },
  {
    description: 'Make sure the terminal was set in the directory',
    fn: ({ contracts, randomSignerFn, local: { terminal, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalDirectory,
        fn: 'terminalOf',
        args: [expectedProjectId],
        expect: terminal,
      }),
  },
  {
    description: "Make sure someone else can't deploy a project with the same handle",
    fn: async ({ contracts, executeFn, randomSignerFn, local: { handle } }) => {
      // The address that will own another project.
      const secondOwner = randomSignerFn();
      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'create',
        args: [secondOwner.address, handle, randomString(), constants.AddressZero],
        revert: 'Projects::create: HANDLE_TAKEN',
      });

      return { secondOwner };
    },
  },
  {
    description: 'Set a new URI',
    fn: async ({ contracts, executeFn, local: { owner, expectedProjectId } }) => {
      const secondUri = randomString();
      await executeFn({
        caller: owner,
        contract: contracts.projects,
        fn: 'setUri',
        args: [expectedProjectId, secondUri],
      });

      return { secondUri };
    },
  },
  {
    description: 'Make sure the new uri got saved',
    fn: ({ contracts, randomSignerFn, local: { secondUri, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'uriOf',
        args: [expectedProjectId],
        expect: secondUri,
      }),
  },
  {
    description: 'Set a new handle.',
    fn: async ({ contracts, executeFn, local: { owner, handle, expectedProjectId } }) => {
      const secondHandle = randomBytes({
        // Make sure its unique by prepending the id.
        prepend: expectedProjectId.toString(),
        exclude: [handle],
      });
      await executeFn({
        caller: owner,
        contract: contracts.projects,
        fn: 'setHandle',
        args: [expectedProjectId, secondHandle],
      });

      return { secondHandle };
    },
  },
  {
    description: 'Make sure the new handle got saved',
    fn: ({ contracts, randomSignerFn, local: { secondHandle, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'handleOf',
        args: [expectedProjectId],
        expect: secondHandle,
      }),
  },
  {
    description: 'Make sure the project was saved to the new handle',
    fn: ({ contracts, randomSignerFn, local: { secondHandle, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [secondHandle],
        expect: expectedProjectId,
      }),
  },
  {
    description: "Make sure the old handle isn't affiliated with a project any longer",
    fn: ({ contracts, randomSignerFn, local: { handle } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [handle],
        expect: 0,
      }),
  },
  {
    description: 'Create another project for a different owner using the old handle',
    fn: async ({
      contracts,
      executeFn,
      randomSignerFn,
      incrementProjectIdFn,
      local: { secondOwner, handle },
    }) => {
      const expectedSecondProjectId = incrementProjectIdFn();

      await executeFn({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'create',
        args: [secondOwner.address, handle, randomString(), constants.AddressZero],
      });
      return { expectedSecondProjectId };
    },
  },
  {
    description:
      "Make sure the other owner can't set its project's handle to the one currently in use",
    fn: ({ contracts, executeFn, local: { secondOwner, secondHandle, expectedSecondProjectId } }) =>
      executeFn({
        caller: secondOwner,
        contract: contracts.projects,
        fn: 'setHandle',
        args: [expectedSecondProjectId, secondHandle],
        revert: 'Projects::setHandle: HANDLE_TAKEN',
      }),
  },
  {
    description: "Don't allow a handle to be transfered if the replacement is taken",
    fn: ({ contracts, executeFn, local: { owner, secondOwner, handle, expectedProjectId } }) =>
      executeFn({
        caller: owner,
        contract: contracts.projects,
        fn: 'transferHandle',
        args: [expectedProjectId, secondOwner.address, handle],
        revert: 'Projects::transferHandle: HANDLE_TAKEN',
      }),
  },
  {
    description: 'Transfer a handle and replace it with a new one',
    fn: async ({
      contracts,
      executeFn,
      local: { owner, secondOwner, expectedProjectId, handle, secondHandle },
    }) => {
      const thirdHandle = randomBytes({
        // Make sure its unique by prepending the id.
        prepend: expectedProjectId.toString(),
        exclude: [handle, secondHandle],
      });
      await executeFn({
        caller: owner,
        contract: contracts.projects,
        fn: 'transferHandle',
        args: [expectedProjectId, secondOwner.address, thirdHandle],
      });
      return { thirdHandle };
    },
  },
  {
    description: 'Make sure the replacement handle got saved',
    fn: ({ contracts, randomSignerFn, local: { thirdHandle, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'handleOf',
        args: [expectedProjectId],
        expect: thirdHandle,
      }),
  },
  {
    description: 'Make sure the project was saved to the replacement handle',
    fn: ({ contracts, randomSignerFn, local: { thirdHandle, expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [thirdHandle],
        expect: expectedProjectId,
      }),
  },
  {
    description: 'Make sure there is no project associated with the transfered handle',
    fn: ({ contracts, randomSignerFn, local: { secondHandle } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [secondHandle],
        expect: 0,
      }),
  },
  {
    description: "Make sure a project can't be created with the transfered handle",
    fn: ({ deployer, contracts, executeFn, local: { secondOwner, secondHandle } }) =>
      executeFn({
        caller: deployer,
        contract: contracts.projects,
        fn: 'create',
        args: [secondOwner.address, secondHandle, randomString(), constants.AddressZero],
        revert: 'Projects::create: HANDLE_TAKEN',
      }),
  },
  {
    description: "Make sure a project can't set its handle to the transfered handle",
    fn: ({ contracts, executeFn, local: { secondOwner, secondHandle, expectedSecondProjectId } }) =>
      executeFn({
        caller: secondOwner,
        contract: contracts.projects,
        fn: 'setHandle',
        args: [expectedSecondProjectId, secondHandle],
        revert: 'Projects::setHandle: HANDLE_TAKEN',
      }),
  },
  {
    description: 'Make sure no one else but the intended recipient can claim the transferd handle',
    fn: ({
      contracts,
      executeFn,
      local: { owner, secondOwner, secondHandle, expectedProjectId },
    }) =>
      executeFn({
        caller: owner,
        contract: contracts.projects,
        fn: 'claimHandle',
        args: [secondHandle, owner.address, expectedProjectId],
        revert: owner.address !== secondOwner.address && 'Projects::claimHandle: UNAUTHORIZED',
      }),
  },
  {
    description: "Make sure a transfered handle can be claimed if it hasn't been already",
    fn: ({
      contracts,
      executeFn,
      local: { owner, secondOwner, secondHandle, expectedSecondProjectId },
    }) =>
      executeFn({
        caller: secondOwner,
        contract: contracts.projects,
        fn: 'claimHandle',
        args: [secondHandle, secondOwner.address, expectedSecondProjectId],
        revert: owner.address === secondOwner.address && 'Projects::claimHandle: UNAUTHORIZED',
      }),
  },
  {
    description: 'Make sure the claimed handle got saved',
    fn: ({
      contracts,

      randomSignerFn,
      local: { owner, secondOwner, secondHandle, expectedProjectId, expectedSecondProjectId },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'handleOf',
        args: [owner.address === secondOwner.address ? expectedProjectId : expectedSecondProjectId],
        expect: secondHandle,
      }),
  },
  {
    description: 'Make sure the project was saved to the claimed handle',
    fn: ({
      contracts,

      randomSignerFn,
      local: { owner, secondOwner, secondHandle, expectedProjectId, expectedSecondProjectId },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [secondHandle],
        expect: owner.address === secondOwner.address ? expectedProjectId : expectedSecondProjectId,
      }),
  },
  {
    description: 'Check to see if the first handle is still set correctly',
    fn: ({
      contracts,

      randomSignerFn,
      local: { owner, secondOwner, handle, expectedSecondProjectId },
    }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.projects,
        fn: 'projectFor',
        args: [handle],
        expect: owner.address === secondOwner.address ? expectedSecondProjectId : 0,
      }),
  },
  {
    description: 'Make a payment to the project',
    fn: async ({
      contracts,
      executeFn,
      BigNumber,
      getBalance,
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
    description: "Configure the project's funding cycle",
    fn: async ({
      contracts,
      executeFn,
      BigNumber,
      incrementFundingCycleIdFn,
      local: { owner, paymentValue, expectedProjectId },
    }) => {
      // Burn the unused funding cycle ID.
      incrementFundingCycleIdFn();

      // The currency will be 0, which corresponds to ETH.
      const currency = 0;
      await executeFn({
        caller: owner,
        contract: contracts.terminalV1,
        fn: 'configure',
        args: [
          expectedProjectId,
          {
            // Set a target amount thats at least the payment value so that the full payment value can be tapped.
            target: randomBigNumber({ min: paymentValue }),
            currency,
            duration: randomBigNumber({
              min: BigNumber.from(1),
              max: constants.MaxUint16,
            }),
            cycleLimit: randomBigNumber({ max: this.MaxCycleLimit }),
            discountRate: randomBigNumber({ max: this.MaxPercent }),
            ballot: constants.AddressZero,
          },
          {
            reservedRate: randomBigNumber({
              max: this.MaxPercent,
            }),
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
      return { currency };
    },
  },
  {
    description: "Anyone can tap the full payment value on the project's behalf",
    fn: ({
      contracts,
      executeFn,
      randomSignerFn,
      local: { paymentValue, currency, expectedProjectId },
    }) =>
      executeFn({
        caller: randomSignerFn(),
        contract: contracts.terminalV1,
        fn: 'tap',
        args: [expectedProjectId, paymentValue, currency, paymentValue],
      }),
  },
];
