module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**',
    '!**/vendor/**'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Mock Hedera SDK in CI environment
  moduleNameMapper: process.env.CI ? {
    '@hashgraph/sdk': '<rootDir>/tests/__mocks__/@hashgraph/sdk.js'
  } : {}
};
