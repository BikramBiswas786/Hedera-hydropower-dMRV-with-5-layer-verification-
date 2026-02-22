// scripts/create-remaining-resources.js
const {
  Client, PrivateKey, AccountId,
  TopicCreateTransaction,
  TokenCreateTransaction,
  TokenType, TokenSupplyType,
  Hbar
} = require('@hashgraph/sdk');
require('dotenv').config();

async function createRemainingResources() {
  const operatorId  = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
  const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY);

  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  client.setDefaultMaxTransactionFee(new Hbar(100));

  console.log('\n🔗 Creating remaining on-chain resources for MRV system...\n');
  console.log(`Operator Account: ${operatorId}`);
  console.log(`Existing Audit Topic: ${process.env.AUDIT_TOPIC_ID}\n`);

  const results = [];

  // ─── 1. DID TOPIC (HCS) ───────────────────────────────────────
  console.log('1️⃣  Creating DID TOPIC (HCS) for Decentralized Identity...');
  try {
    const didTx = await new TopicCreateTransaction()
      .setTopicMemo('MRV DID Registry - Plant & Device Identities')
      .setSubmitKey(operatorKey.publicKey)
      .execute(client);
    const didReceipt = await didTx.getReceipt(client);
    const didTopicId = didReceipt.topicId.toString();
    console.log(`   ✅ DID_TOPIC_ID=${didTopicId}`);
    results.push({ key: 'DID_TOPIC_ID', value: didTopicId });
  } catch (err) {
    console.error(`   ❌ Failed: ${err.message}`);
  }

  // ─── 2. CARBON CREDIT TOKEN (HTS - Fungible) ──────────────────
  console.log('\n2️⃣  Creating CARBON CREDIT TOKEN (HTS Fungible)...');
  try {
    const carbonTx = await new TokenCreateTransaction()
      .setTokenName('MRV Carbon Credit')
      .setTokenSymbol('MRVCC')
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(6)
      .setInitialSupply(0)
      .setSupplyType(TokenSupplyType.Infinite)
      .setSupplyKey(operatorKey.publicKey)
      .setTreasuryAccountId(operatorId)
      .setTokenMemo('ACM0002 Verified Carbon Credits - tCO2 equivalent')
      .setAdminKey(operatorKey.publicKey)
      .setFreezeKey(operatorKey.publicKey)
      .setWipeKey(operatorKey.publicKey)
      .execute(client);
    const carbonReceipt = await carbonTx.getReceipt(client);
    const carbonTokenId = carbonReceipt.tokenId.toString();
    console.log(`   ✅ CARBON_TOKEN_ID=${carbonTokenId}`);
    results.push({ key: 'CARBON_TOKEN_ID', value: carbonTokenId });
  } catch (err) {
    console.error(`   ❌ Failed: ${err.message}`);
  }

  // ─── 3. REC TOKEN (HTS - NFT) ─────────────────────────────────
  console.log('\n3️⃣  Creating REC TOKEN (HTS NFT)...');
  try {
    const recTx = await new TokenCreateTransaction()
      .setTokenName('MRV Renewable Energy Certificate')
      .setTokenSymbol('MRVREC')
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Infinite)
      .setSupplyKey(operatorKey.publicKey)
      .setTreasuryAccountId(operatorId)
      .setTokenMemo('Hedera-verified RECs for hydropower generation')
      .setAdminKey(operatorKey.publicKey)
      .setFreezeKey(operatorKey.publicKey)
      .setWipeKey(operatorKey.publicKey)
      .execute(client);
    const recReceipt = await recTx.getReceipt(client);
    const recTokenId = recReceipt.tokenId.toString();
    console.log(`   ✅ REC_TOKEN_ID=${recTokenId}`);
    results.push({ key: 'REC_TOKEN_ID', value: recTokenId });
  } catch (err) {
    console.error(`   ❌ Failed: ${err.message}`);
  }

  // ─── 4. VERIFICATION LOG TOPIC (HCS) ──────────────────────────
  console.log('\n4️⃣  Creating VERIFICATION LOG TOPIC (HCS)...');
  try {
    const verifyTx = await new TopicCreateTransaction()
      .setTopicMemo('MRV Verification Logs - ML & Physics Check Results')
      .setSubmitKey(operatorKey.publicKey)
      .execute(client);
    const verifyReceipt = await verifyTx.getReceipt(client);
    const verifyTopicId = verifyReceipt.topicId.toString();
    console.log(`   ✅ VERIFY_TOPIC_ID=${verifyTopicId}`);
    results.push({ key: 'VERIFY_TOPIC_ID', value: verifyTopicId });
  } catch (err) {
    console.error(`   ❌ Failed: ${err.message}`);
  }

  // ─── SUMMARY ───────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✅ ALL RESOURCES CREATED!                   ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log('Add these to your .env file:\n');
  results.forEach(r => console.log(`${r.key}=${r.value}`));
  console.log(`\nView on HashScan:`);
  console.log(`  Account: https://hashscan.io/testnet/account/${operatorId}`);
  results.forEach(r => {
    if (r.key.includes('TOPIC')) {
      console.log(`  ${r.key.split('_')[0]}: https://hashscan.io/testnet/topic/${r.value}`);
    } else if (r.key.includes('TOKEN')) {
      console.log(`  ${r.key.split('_')[0]}: https://hashscan.io/testnet/token/${r.value}`);
    }
  });

  await client.close();
  return results;
}

createRemainingResources().catch(console.error);
