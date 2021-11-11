import { expect } from 'chai';
import { getAddresses, getDeployer } from '../../../helpers/utils';

let deployer;
let addrs;

const tests = {
  success: [
    {
      description: 'sets preferences',
      fn: () => ({
        caller: deployer,
        beneficiary: addrs[0].address,
        prefereClaimedTickets: true,
      }),
    },
  ],
};

export default function () {
  before(async function () {
    deployer = await getDeployer();
    addrs = await getAddresses();
  });
  describe('Success cases', function () {
    tests.success.forEach(function (successTest) {
      it(successTest.description, async function () {
        const { caller, beneficiary, prefereClaimedTickets } = successTest.fn(this);

        // Execute the transaction.
        const tx = await this.contract
          .connect(caller)
          .setPayerPreferences(beneficiary, prefereClaimedTickets);

        // Expect an event to have been emitted.
        await expect(tx)
          .to.emit(this.contract, 'SetPayerPreferences')
          .withArgs(caller.address, beneficiary, prefereClaimedTickets);

        // Get the stored ticket for the caller.
        const storedBeneficiary = await this.contract.connect(caller).beneficiaryOf(caller.address);

        // Get the stored preference for the caller.
        const storedPreferUnstakedTickets = await this.contract
          .connect(caller)
          .unstakedTicketsPreferenceOf(caller.address);

        expect(storedBeneficiary).to.equal(beneficiary);
        expect(storedPreferUnstakedTickets).to.equal(prefereClaimedTickets);
      });
    });
  });
}
