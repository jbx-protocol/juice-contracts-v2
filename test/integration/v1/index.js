import { BigNumber, utils } from 'ethers';
import { constants, deployContract } from '../../utils';
import {
  projects as _projects,
  challengeHandle,
  deploy,
  ticketLockingAndTransfers,
  redeem,
  printReservedTickets,
  printPreminedTickets,
  issueTickets,
  tap,
  takeFee,
  reconfigure,
  limit,
  zeroDuration,
  nonRecurring,
  approvedBallot,
  failedBallot,
  iteratedFailedBallot,
  migrate,
  operatorPermissions,
  setPayoutMods,
  setTicketMods,
  governance as _governance,
  setFee,
  currencyConversion,
  transferProjectOwnership,
  directPaymentAddresses,
  setTerminal,
  proxyPaymentAddresses,
} from './workflows';

// The first project ID is used for governance.
let projectId = BigNumber.from(1);
// The first funding cycle ID is used for governance.
let fundingCycleId = BigNumber.from(1);

let currency = BigNumber.from(0);

const run = function (ops) {
  return function () {
    // eslint-disable-next-line no-restricted-syntax
    for (const op of ops) {
      it(op.description, async function () {
        this.local = {
          ...this.local,
          // eslint-disable-next-line no-await-in-loop
          ...(await op.fn(this)),
        };
      });
    }
  };
};

export default function () {
  // Deploy all contracts.
  before(async function () {
    const operatorStore = await deployContract('OperatorStore');
    const projects = await deployContract('Projects', [operatorStore.address]);
    const prices = await deployContract('Prices');
    const terminalDirectory = await deployContract('TerminalDirectory', [
      projects.address,
      operatorStore.address,
    ]);
    const fundingCycles = await deployContract('FundingCycles', [terminalDirectory.address]);

    const ticketBooth = await deployContract('TicketBooth', [
      projects.address,
      operatorStore.address,
      terminalDirectory.address,
    ]);

    const modStore = await deployContract('ModStore', [
      projects.address,
      operatorStore.address,
      terminalDirectory.address,
    ]);

    const governance = await deployContract('Governance', [1, terminalDirectory.address]);

    const terminalV1 = await deployContract('TerminalV1', [
      projects.address,
      fundingCycles.address,
      ticketBooth.address,
      operatorStore.address,
      modStore.address,
      prices.address,
      terminalDirectory.address,
      governance.address,
    ]);

    const proxyPaymentAddressManager = await deployContract('ProxyPaymentAddressManager', [
      terminalDirectory.address,
      ticketBooth.address,
    ]);

    // Set governance as the prices contract owner.
    await prices.transferOwnership(governance.address);
    /** 
      Deploy the governance contract's project. It will have an ID of 1.
    */
    await this.executeFn({
      caller: this.deployer,
      contract: terminalV1,
      fn: 'deploy',
      args: [
        this.deployer.address,
        utils.formatBytes32String('juicebox'),
        '',
        {
          target: 0,
          currency: 0,
          // Duration must be zero so that the same cycle lasts throughout the tests.
          duration: 0,
          cycleLimit: BigNumber.from(0),
          discountRate: BigNumber.from(0),
          ballot: constants.AddressZero,
        },
        {
          reservedRate: 0,
          bondingCurveRate: 0,
          reconfigurationBondingCurveRate: 0,
        },
        [],
        [],
      ],
    });

    // Bind the contracts to give the wokflows access to them.
    this.contracts = {
      governance,
      terminalDirectory,
      prices,
      operatorStore,
      ticketBooth,
      fundingCycles,
      projects,
      modStore,
      terminalV1,
      proxyPaymentAddressManager,
    };

    // TODO(odd-amphora): Temporary fix for dynamic integration testing constants.
    // This actually doesn't work.

    // Bind the standard weight multiplier to the constants.
    // This is used to determine how many tickets get printed per value contributed during a first funding cycle.
    this.InitialWeightMultiplier = (await fundingCycles.BASE_WEIGHT()).div(
      BigNumber.from(10).pow(18),
    );

    this.MaxCycleLimit = await fundingCycles.MAX_CYCLE_LIMIT();

    this.GovernanceProjectId = projectId;
    this.GovenanceOwner = this.deployer.address;

    // All perecents are out of 200, except for mods.
    this.MaxPercent = BigNumber.from(200);

    // Mod percents are out of 10000.
    this.MaxModPercent = BigNumber.from(10000);

    // Discount rate percents are out of 201. sending 201 creates a non recurring funding cycle.
    this.MaxDiscountRate = BigNumber.from(201);

    // The denominator for discount rates is 1000, meaning only 80% - 100% are accessible.
    this.DiscountRatePercentDenominator = BigNumber.from(1000);

    this.incrementProjectIdFn = () => {
      projectId = projectId.add(1);
      return projectId;
    };
    this.incrementFundingCycleIdFn = () => {
      fundingCycleId = fundingCycleId.add(1);
      return fundingCycleId;
    };

    this.incrementCurrencyFn = () => {
      currency = currency.add(1);
      return currency;
    };

    this.bondingCurveFn = ({ rate, count, total, overflow }) => {
      if (count.eq(total)) return overflow;
      if (rate.eq(this.this.MaxPercent)) return overflow.mul(count).div(total);
      if (rate.eq(0)) return overflow.mul(count).div(total).mul(count).div(total);
      return overflow
        .mul(count)
        .div(total)
        .mul(rate.add(count.mul(this.this.MaxPercent.sub(rate)).div(total)))
        .div(this.this.MaxPercent);
    };
  });

  for (let i = 0; i < 8; i += 1) {
    describe(
      'Projects can be created, have their URIs changed, transfer/claim handles, and be attached to funding cycles',
      run(_projects),
    );
    describe(
      "Projects can have their handle's challenged, and claimed if not renewed in time",
      run(challengeHandle),
    );
    describe('Deployment of a project with funding cycles and mods included', run(deploy));
    describe(
      'Ticket holders can lock their tickets, which prevents them from being redeemed, unstaked, or transfered',
      run(ticketLockingAndTransfers),
    );
    describe('Redeem tickets for overflow', run(redeem));
    describe('Prints reserved tickets', run(printReservedTickets));
    describe(
      'Projects can print premined tickets before a payment has been made to it',
      run(printPreminedTickets),
    );
    describe('Issues tickets and honors preference', run(issueTickets));
    describe('Tap funds up to the configured target', run(tap));
    describe(
      "A fee should be taken into governance's project when a project taps funds",
      run(takeFee),
    );
    describe('Reconfigures a project', run(reconfigure));
    describe('A funding cycle configuration can have a limit', run(limit));
    describe('A funding cycle configuration can have a duration of 0', run(zeroDuration));
    describe('A funding cycle configuration can be non recurring', run(nonRecurring));
    describe('Ballot must be approved for reconfiguration to become active', run(approvedBallot));
    describe('Reconfiguration that fails a ballot should be ignored', run(failedBallot));
    describe(
      'Reconfiguration proposed after a failed configuration should obide by the ballot duration',
      run(iteratedFailedBallot),
    );
    describe('Migrate from one Terminal to another', run(migrate));
    describe('Operators can be given permissions', run(operatorPermissions));
    describe('Set and update payout mods, honoring locked status', run(setPayoutMods));
    describe('Set and update ticket mods, honoring locked status', run(setTicketMods));
    describe('A new governance can be appointed and accepted', run(_governance));
    describe('Governance can set a new fee for future configurations', run(setFee));
    describe('Currencies rates are converted to/from correctly', run(currencyConversion));
    describe('Transfer ownership over a project', run(transferProjectOwnership));
    describe(
      'Direct payment addresses can be deployed to add an fundable address to a project',
      run(directPaymentAddresses),
    );
    describe(
      'A project can be created without a payment terminal, and can set one after',
      run(setTerminal),
    );
    describe(
      'Proxy payment addresses can be deployed to add an fundable address to a project',
      run(proxyPaymentAddresses),
    );
  }
}
