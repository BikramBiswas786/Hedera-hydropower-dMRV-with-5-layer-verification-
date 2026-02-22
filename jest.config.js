module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).js'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '@hashgraph/sdk': '<rootDir>/tests/__mocks__/@hashgraph/sdk.js',
    '.*MLAnomalyDetector.*': '<rootDir>/tests/__mocks__/MLAnomalyDetector.js'
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/vercel-ui/'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!**/node_modules/**'
  ]
};
