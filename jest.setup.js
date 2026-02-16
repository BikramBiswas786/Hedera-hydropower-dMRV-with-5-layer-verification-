/**
 * Jest Setup File
 * Runs before all tests
 */

process.env.NODE_ENV = 'test';
process.env.HEDERA_NETWORK = 'testnet';

// Mock Hedera SDK
jest.mock('@hashgraph/sdk', () => ({
  Client: {
    forTestnet: jest.fn().mockReturnValue({
      setOperator: jest.fn().mockReturnThis(),
      close: jest.fn(),
      setDefaultMaxTransactionFee: jest.fn().mockReturnThis()
    })
  },
  AccountId: {
    fromString: jest.fn((id) => ({ toString: () => id }))
  },
  PrivateKey: {
    generateED25519: jest.fn().mockReturnValue({
      publicKey: {
        toStringRaw: jest.fn().mockReturnValue('test-public-key')
      },
      toStringRaw: jest.fn().mockReturnValue('test-private-key')
    }),
    fromString: jest.fn((key) => ({
      publicKey: {
        toStringRaw: jest.fn().mockReturnValue('test-public-key')
      },
      toStringRaw: jest.fn().mockReturnValue(key)
    }))
  },
  TopicCreateTransaction: jest.fn().mockReturnValue({
    setTopicMemo: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        topicId: { toString: () => '0.0.7462776' }
      })
    })
  }),
  TopicMessageSubmitTransaction: jest.fn().mockReturnValue({
    setTopicId: jest.fn().mockReturnThis(),
    setMessage: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        status: { toString: () => 'SUCCESS' }
      })
    })
  }),
  TokenCreateTransaction: jest.fn().mockReturnValue({
    setTokenName: jest.fn().mockReturnThis(),
    setTokenSymbol: jest.fn().mockReturnThis(),
    setDecimals: jest.fn().mockReturnThis(),
    setInitialSupply: jest.fn().mockReturnThis(),
    setTreasuryAccountId: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        tokenId: { toString: () => '0.0.7462931' }
      })
    })
  }),
  TokenMintTransaction: jest.fn().mockReturnValue({
    setTokenId: jest.fn().mockReturnThis(),
    setAmount: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({
      getReceipt: jest.fn().mockResolvedValue({
        status: { toString: () => 'SUCCESS' }
      })
    })
  }),
  Hbar: {
    from: jest.fn((amount, unit) => ({
      to: jest.fn((targetUnit) => amount),
      toTinybars: jest.fn(() => amount * 100000000)
    }))
  }
}));

// Global test utilities
global.testUtils = {
  createSampleReading: (overrides = {}) => ({
    readingId: 'READ-001',
    timestamp: new Date().toISOString(),
    flowRate: 2.5,
    head: 45.0,
    efficiency: 0.85,
    generatedKwh: 106.3,
    pH: 7.5,
    turbidity: 25,
    temperature: 18.0,
    ...overrides
  }),
  
  createDeviceProfile: (overrides = {}) => ({
    deviceId: 'TURBINE-1',
    capacity: 100,
    maxFlow: 10,
    maxHead: 500,
    minEfficiency: 0.70,
    ...overrides
  }),
  
  createHistoricalData: (count = 10) => {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push({
        readingId: `READ-${i.toString().padStart(3, '0')}`,
        generatedKwh: 100 + Math.random() * 20,
        flowRate: 2.5 + Math.random() * 0.5,
        head: 45.0 + Math.random() * 2,
        timestamp: new Date(Date.now() - i * 3600000).toISOString()
      });
    }
    return data;
  }
};
