module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/*.test.js',
    '**/test-*.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'code/**/*.js',
    '*.js',
    '!node_modules/**',
    '!coverage/**',
    '!dist/**'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 30000,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
