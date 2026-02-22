// Full Hedera SDK mock — no network calls in CI

class Client {
  static forTestnet()  { return new Client(); }
  static forMainnet()  { return new Client(); }
  setOperator()        { return this; }
  close()              { return Promise.resolve(); }
}

class AccountId {
  constructor(s, r, n) { this.shard = s||0; this.realm = r||0; this.num = n||0; }
  static fromString(s) {
    const [a=0,b=0,c=0] = s.split('.').map(Number);
    return new AccountId(a,b,c);
  }
  toString() { return `${this.shard}.${this.realm}.${this.num}`; }
}

class PrivateKey {
  static fromString() { return { sign: () => Buffer.alloc(64), publicKey: { toStringRaw: () => 'mockpubkey' } }; }
  static generate()   { return this.fromString('mock'); }
}

class TopicId {
  constructor(s,r,n) { this.shard=s||0; this.realm=r||0; this.num=n||0; }
  static fromString(s) {
    const [a=0,b=0,c=0] = s.split('.').map(Number);
    return new TopicId(a,b,c);
  }
  toString() { return `${this.shard}.${this.realm}.${this.num}`; }
}

class TokenId {
  constructor(s,r,n) { this.shard=s||0; this.realm=r||0; this.num=n||0; }
  static fromString(s) {
    const [a=0,b=0,c=0] = s.split('.').map(Number);
    return new TokenId(a,b,c);
  }
  toString() { return `${this.shard}.${this.realm}.${this.num}`; }
}

class TransactionId {
  static generate() { return { toString: () => '0.0.12345@1234567890.000000000' }; }
}

const mockReceipt = () => Promise.resolve({
  status: Status.Success,
  topicSequenceNumber: { toNumber: () => 1 },
  serials: [{ toNumber: () => 1 }],
  tokenId: new TokenId(0,0,88888),
  topicId: new TopicId(0,0,99999),
  fileId: null
});

const mockResponse = () => Promise.resolve({
  transactionId: TransactionId.generate(),
  getReceipt: mockReceipt,
  getRecord: () => Promise.resolve({ transactionId: TransactionId.generate() })
});

class TopicMessageSubmitTransaction {
  setTopicId()    { return this; }
  setMessage()    { return this; }
  setMaxChunks()  { return this; }
  freezeWith()    { return this; }
  sign()          { return Promise.resolve(this); }
  execute()       { return mockResponse(); }
}

class TopicCreateTransaction {
  setTopicMemo()      { return this; }
  setAdminKey()       { return this; }
  setSubmitKey()      { return this; }
  freezeWith()        { return this; }
  sign()              { return Promise.resolve(this); }
  execute()           { return mockResponse(); }
}

class TokenCreateTransaction {
  setTokenName()       { return this; }
  setTokenSymbol()     { return this; }
  setDecimals()        { return this; }
  setInitialSupply()   { return this; }
  setTreasuryAccountId(){ return this; }
  setAdminKey()        { return this; }
  setSupplyKey()       { return this; }
  freezeWith()         { return this; }
  sign()               { return Promise.resolve(this); }
  execute()            { return mockResponse(); }
}

class TokenMintTransaction {
  setTokenId()   { return this; }
  setAmount()    { return this; }
  setMetadata()  { return this; }
  freezeWith()   { return this; }
  sign()         { return Promise.resolve(this); }
  execute()      { return mockResponse(); }
}

class FileCreateTransaction {
  setContents()  { return this; }
  setKeys()      { return this; }
  freezeWith()   { return this; }
  sign()         { return Promise.resolve(this); }
  execute()      { return mockResponse(); }
}

class Hbar {
  constructor(v) { this.value = v; }
  static fromTinybars(v) { return new Hbar(v); }
  static from(v) { return new Hbar(v); }
}

class Status {
  static get Success()  { return { toString: () => 'SUCCESS', _code: 22 }; }
  static get Ok()       { return { toString: () => 'OK', _code: 200 }; }
}

class KeyList {
  constructor(keys) { this.keys = keys || []; }
  static of(...keys) { return new KeyList(keys); }
}

module.exports = {
  Client,
  AccountId,
  PrivateKey,
  TopicId,
  TokenId,
  TransactionId,
  TopicMessageSubmitTransaction,
  TopicCreateTransaction,
  TokenCreateTransaction,
  TokenMintTransaction,
  FileCreateTransaction,
  Hbar,
  Status,
  KeyList
};
