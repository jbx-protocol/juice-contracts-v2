/** 
  Projects can deploy addresses that will forward funds received to the project's funding cycle.
*/

import { BigNumber } from 'ethers';

import { verifyBalance } from '../../../helpers/utils';

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

      // Burn the unused funding cycle ID id.
      incrementFundingCycleIdFn();

      const owner = randomSignerFn();

      // Make the test case cleaner with a reserved rate of 0.
      const reservedRate = BigNumber.from(0);

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
            target: BigNumber.from(1),
            currency,
            duration: randomBigNumber({
              min: BigNumber.from(0),
              max: constants.MaxUint16,
            }),
            cycleLimit: randomBigNumber({
              max: this.MaxCycleLimit,
            }),
            discountRate: randomBigNumber({ max: this.MaxPercent }),
            ballot: constants.AddressZero,
          },
          {
            reservedRate,
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
      return { owner, reservedRate, expectedProjectId };
    },
  },
  {
    description: "Make sure the terminalV1 got set as the project's current terminal",
    fn: ({ contracts, randomSignerFn, local: { expectedProjectId } }) =>
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.terminalDirectory,
        fn: 'terminalOf',
        args: [expectedProjectId],
        expect: contracts.terminalV1.address,
      }),
  },
  {
    description: 'Deploy a proxy payment address',
    fn: ({ executeFn, deployer, contracts, randomString, local: { expectedProjectId } }) =>
      executeFn({
        caller: deployer,
        contract: contracts.proxyPaymentAddressManager,
        fn: 'deploy',
        args: [expectedProjectId, randomString()],
      }),
  },
  {
    description: 'Make a payment to the proxy payment address',
    fn: async ({ contracts, BigNumber, randomSignerFn, local: { expectedProjectId } }) => {
      const [proxyPaymentAddress] = await contracts.proxyPaymentAddressManager.addressesOf(
        expectedProjectId,
      );
      // An account that will be used to make payments.
      const payer = randomSignerFn();

      // Three payments will be made. Cant pay entire balance because some is needed for gas.
      // So, arbitrarily divide the balance so that all payments can be made successfully.
      const paymentValue = BigNumber.from(1);

      await payer.sendTransaction({
        to: proxyPaymentAddress,
        value: paymentValue,
      });

      return { payer, paymentValue, proxyPaymentAddress };
    },
  },
  {
    description: 'There should now be a balance in the proxy payment address',
    fn: ({ local: { paymentValue, proxyPaymentAddress } }) =>
      verifyBalance({
        address: proxyPaymentAddress,
        expect: paymentValue,
      }),
  },
  {
    description: 'Tap the proxy payment address',
    fn: async ({ executeFn, local: { proxyPaymentAddress, payer } }) => {
      await executeFn({
        caller: payer,
        contractName: 'ProxyPaymentAddress',
        contractAddress: proxyPaymentAddress,
        fn: 'tap',
      });
    },
  },
  {
    description: 'The balance should be empty in the proxy payment address',
    fn: ({ local: { proxyPaymentAddress } }) =>
      verifyBalance({
        address: proxyPaymentAddress,
        expect: BigNumber.from(0),
      }),
  },
  {
    description:
      'Make sure the correct number of tickets were printed for the proxy payment address',
    fn: ({
      contracts,
      randomSignerFn,
      local: { proxyPaymentAddress, expectedProjectId, paymentValue },
    }) => {
      const expectedNumTickets = paymentValue.mul(this.InitialWeightMultiplier);
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [proxyPaymentAddress, expectedProjectId],
        expect: expectedNumTickets,
      });
      return { expectedNumTickets };
    },
  },
  {
    description: 'Transfer tickets from non-owner should fail.',
    fn: async ({
      randomSignerFn,
      executeFn,
      local: { proxyPaymentAddress, expectedNumTickets },
    }) => {
      const beneficiary = randomSignerFn();

      await executeFn({
        caller: randomSignerFn(),
        contractName: 'ProxyPaymentAddress',
        contractAddress: proxyPaymentAddress,
        fn: 'transferTickets',
        args: [beneficiary.address, expectedNumTickets],
        revert: 'Ownable: caller is not the owner',
      });

      return { beneficiary };
    },
  },
  {
    description: 'Transfer tickets from the proxy payment address',
    fn: async ({
      randomSignerFn,
      deployer,
      executeFn,
      local: { proxyPaymentAddress, expectedNumTickets },
    }) => {
      const beneficiary = randomSignerFn();

      await executeFn({
        caller: deployer,
        contractName: 'ProxyPaymentAddress',
        contractAddress: proxyPaymentAddress,
        fn: 'transferTickets',
        args: [beneficiary.address, expectedNumTickets],
      });

      return { beneficiary };
    },
  },
  {
    description: 'Make sure the correct number of tickets are transferred to the beneficiary',
    fn: ({
      contracts,
      randomSignerFn,
      local: { expectedNumTickets, expectedProjectId, beneficiary },
    }) => {
      verifyContractGetter({
        caller: randomSignerFn(),
        contract: contracts.ticketBooth,
        fn: 'balanceOf',
        args: [beneficiary.address, expectedProjectId],
        expect: expectedNumTickets,
      });
    },
  },
];
