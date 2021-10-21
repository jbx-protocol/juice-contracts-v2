// import { expect } from 'chai';
// import { BigNumber } from 'ethers';

// const tests = {
//   success: [
//     {
//       description: 'add feed, 18 decimals',
//       fn: ({ deployer }) => ({
//         caller: deployer,
//         set: {
//           currency: 1,
//           base: 2,
//         },
//         decimals: 18,
//       }),
//     },
//     {
//       description: 'add feed, 0 decimals',
//       fn: ({ deployer }) => ({
//         caller: deployer,
//         set: {
//           currency: 1,
//           base: 2,
//         },
//         decimals: 0,
//       }),
//     },
//   ],
//   failure: [
//     {
//       description: 'not owner',
//       fn: ({ addrs }) => ({
//         caller: addrs[0],
//         set: {
//           currency: 1,
//           base: 2,
//         },
//         decimals: 18,
//         revert: 'Ownable: caller is not the owner',
//       }),
//     },
//     {
//       description: 'already exists',
//       fn: ({ deployer }) => ({
//         caller: deployer,
//         preset: {
//           currency: 1,
//           base: 2,
//         },
//         set: {
//           currency: 1,
//           base: 2,
//         },
//         decimals: 18,
//         revert: '0x04: ALREADY_EXISTS',
//       }),
//     },
//     {
//       description: 'over 18 decimals',
//       fn: ({ deployer }) => ({
//         caller: deployer,
//         set: {
//           currency: 1,
//           base: 2,
//         },
//         decimals: 19,
//         revert: '0x05: BAD_DECIMALS',
//       }),
//     },
//   ],
// };

// export default function () {
//   describe('Success cases', function () {
//     tests.success.forEach(function (successTest) {
//       it(successTest.description, async function () {
//         const { caller, set, decimals } = successTest.fn(this);

//         // Set the mock to the return the specified number of decimals.
//         await this.aggregatorV3Contract.mock.decimals.returns(decimals);

//         // Execute the transaction.
//         const tx = await this.contract
//           .connect(caller)
//           .addFeedFor(set.currency, set.base, this.aggregatorV3Contract.address);

//         // Expect an event to have been emitted.
//         await expect(tx)
//           .to.emit(this.contract, 'AddFeed')
//           .withArgs(set.currency, set.base, decimals, this.aggregatorV3Contract.address);

//         // Get a reference to the target number of decimals.
//         const targetDecimals = await this.contract.TARGET_DECIMALS();

//         // Get the stored decimal adjuster value.
//         const storedFeedDecimalAdjuster = await this.contract.feedDecimalAdjusterFor(
//           set.currency,
//           set.base,
//         );

//         // Get a reference to the expected adjuster value.
//         const expectedFeedDecimalAdjuster = BigNumber.from(10).pow(
//           targetDecimals - decimals,
//         );
//         // Expect the stored value to match the expected value.
//         expect(storedFeedDecimalAdjuster).to.equal(expectedFeedDecimalAdjuster);

//         // Get the stored feed.
//         const storedFeed = await this.contract.feedFor(set.currency, set.base);

//         // Expect the stored feed values to match.
//         expect(storedFeed).to.equal(this.aggregatorV3Contract.address);
//       });
//     });
//   });
//   describe('Failure cases', function () {
//     tests.failure.forEach(function (failureTest) {
//       it(failureTest.description, async function () {
//         const { caller, preset, set, decimals, revert } = failureTest.fn(this);

//         await this.aggregatorV3Contract.mock.decimals.returns(decimals);

//         if (preset) {
//           await this.contract
//             .connect(caller)
//             .addFeedFor(preset.currency, preset.base, this.aggregatorV3Contract.address);
//         }

//         await expect(
//           this.contract
//             .connect(caller)
//             .addFeedFor(set.currency, set.base, this.aggregatorV3Contract.address),
//         ).to.be.revertedWith(revert);
//       });
//     });
//   });
// };
