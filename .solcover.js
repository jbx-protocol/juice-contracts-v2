// solidity-coverage configuration file.
//
// https://www.npmjs.com/package/solidity-coverage

module.exports = {
  skipFiles: ['enums/', 'interfaces/', 'libraries/', 'structs/', 'system_tests/'],
  configureYulOptimizer: true,
  measureStatementCoverage: false,
};
