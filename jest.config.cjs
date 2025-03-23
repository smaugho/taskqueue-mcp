module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // Force Jest to exit after all tests have completed
  forceExit: true,
  // Detect open handles and warn about them
  detectOpenHandles: true,
  // Extend the timeout to allow sufficient time for tests to complete
  testTimeout: 30000,
}; 