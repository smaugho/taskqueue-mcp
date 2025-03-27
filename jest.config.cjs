const { createDefaultEsmPreset } = require('ts-jest');

const presetConfig = createDefaultEsmPreset({
  useESM: true,
});

module.exports = {
  ...presetConfig,
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // Force Jest to exit after all tests have completed
  forceExit: true,
  // Detect open handles and warn about them
  detectOpenHandles: true,
  // Extend the timeout to allow sufficient time for tests to complete
  testTimeout: 30000,
}; 