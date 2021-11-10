import v1 from './v1';
import v2 from './v2';

export default function () {
  before(async function () {
    // Bind a function that executes a transaction on a contract.
    this.executeFn = async ({
      caller,
      contract,
      contractName,
      contractAddress,
      fn,
      args = [],
      value = 0,
      events = [],
      revert,
    }) => {
      // Args can be either a function or an array.
      const normalizedArgs = typeof args === 'function' ? await args() : args;

      let contractInternal;
      if (contractName) {
        if (contract) {
          throw 'You can only provide a contract name or contract object.';
        }
        if (!contractAddress) {
          throw 'You must provide a contract address with a contract name.';
        }

        contractInternal = new Contract(
          contractAddress,
          this.readContractAbi(contractName),
          caller,
        );
      } else {
        contractInternal = contract;
      }

      // Save the promise that is returned.
      const promise = contractInternal.connect(caller)[fn](...normalizedArgs, { value });

      // If a revert message is passed in, check to see if it was thrown.
      if (revert) {
        await _expect(promise).to.be.revertedWith(revert);
        return;
      }

      // Await the promise.
      const tx = await promise;

      // Wait for a block to get mined.
      await tx.wait();

      // Set the time mark of this function.
      await this.setTimeMarkFn(tx.blockNumber);

      // Return if there are no events.
      if (events.length === 0) return;

      // Check for events.
      events.forEach((event) =>
        _expect(tx)
          .to.emit(contract, event.name)
          .withArgs(...event.args),
      );
    };
  });

  describe('V1', v1);
  describe('V2', v2);
}
