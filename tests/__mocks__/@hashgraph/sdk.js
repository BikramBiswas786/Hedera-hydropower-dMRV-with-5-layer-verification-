// Mock for @hashgraph/sdk in CI environment

class Client {
  constructor() {
    this.operator = null;
  }
  
  static forTestnet() {
    return new Client();
  }
  
  static forMainnet() {
    return new Client();
  }
  
  setOperator(accountId, privateKey) {
    this.operator = { accountId, privateKey };
    return this;
  }
  
  close() {
    return Promise.resolve();
  }
}

class AccountId {
  constructor(shard, realm, num) {
    this.shard = shard || 0;
    this.realm = realm || 0;
    this.num = num || 0;
  }
  
  static fromString(str) {
    const [shard = 0, realm = 0, num = 0] = str.split('.').map(Number);
    return new AccountId(shard, realm, num);
  }
  
  toString() {
    return `${this.shard}.${this.realm}.${this.num}`;
  }
}

class PrivateKey {
  static fromString(str) {
    return { key: str };
  }
  
  static generate() {
    return { key: 'mock-private-key' };
  }
}

class TopicId {
  constructor(shard, realm, num) {
    this.shard = shard || 0;
    this.realm = realm || 0;
    this.num = num || 0;
  }
  
  static fromString(str) {
    const [shard = 0, realm = 0, num = 0] = str.split('.').map(Number);
    return new TopicId(shard, realm, num);
  }
  
  toString() {
    return `${this.shard}.${this.realm}.${this.num}`;
  }
}

class TokenId {
  constructor(shard, realm, num) {
    this.shard = shard || 0;
    this.realm = realm || 0;
    this.num = num || 0;
  }
  
  static fromString(str) {
    const [shard = 0, realm = 0, num = 0] = str.split('.').map(Number);
    return new TokenId(shard, realm, num);
  }
  
  toString() {
    return `${this.shard}.${this.realm}.${this.num}`;
  }
}

class TopicMessageSubmitTransaction {
  setTopicId(topicId) { return this; }
  setMessage(message) { return this; }
  execute(client) {
    return Promise.resolve({
      getReceipt: () => Promise.resolve({
        status: { _code: 22 },
        topicSequenceNumber: 1
      })
    });
  }
}

class TokenMintTransaction {
  setTokenId(tokenId) { return this; }
  setAmount(amount) { return this; }
  execute(client) {
    return Promise.resolve({
      getReceipt: () => Promise.resolve({
        status: { _code: 22 },
        serials: [1]
      })
    });
  }
}

class Status {
  static get Success() {
    return { _code: 22 };
  }
}

module.exports = {
  Client,
  AccountId,
  PrivateKey,
  TopicId,
  TokenId,
  TopicMessageSubmitTransaction,
  TokenMintTransaction,
  Status
};
