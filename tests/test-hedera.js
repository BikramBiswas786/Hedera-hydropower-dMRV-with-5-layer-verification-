const { Client, PrivateKey, AccountBalanceQuery } = require('@hashgraph/sdk');
require('dotenv').config();
async function testConnection() {
  const myAccountId = process.env.HEDERA_ACCOUNT_ID;
  const myPrivateKeyStr = process.env.HEDERA_PRIVATE_KEY;
  if (!myAccountId || !myPrivateKeyStr) {
    console.error('❌ Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env');
    return;
  }
  try {
    const myPrivateKey = PrivateKey.fromString(myPrivateKeyStr);
    const client = Client.forTestnet();
    client.setOperator(myAccountId, myPrivateKey);
    const query = new AccountBalanceQuery().setAccountId(myAccountId);
    const balance = await query.execute(client);
    console.log('✅ Hedera client OK!');
    console.log('   Balance: ' + balance.hbars.toString() + ' HBAR');
    console.log('   Account: ' + myAccountId);
    console.log('   Key valid: true');
  } catch (error) {
    console.error('❌ Hedera error:', error.message);
    console.error('   Key string:', myPrivateKeyStr.substring(0, 20) + '...');
  }
}
testConnection();
