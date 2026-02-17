const {
  Client,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  PrivateKey,
  Hbar
} = require('@hashgraph/sdk');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// CONFIG FROM ENV
const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY_STR = process.env.HEDERA_OPERATOR_KEY;
const DID_TOPIC_ID = process.env.DID_TOPIC_ID || "0.0.7941871";

if (!OPERATOR_ID || !OPERATOR_KEY_STR) {
  console.error("❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env");
  process.exit(1);
}

async function createRecToken() {
  console.log('\n========================================');
  console.log('Creating REC Token (FIXED FEE)');
  console.log('========================================\n');

  const operatorKey = PrivateKey.fromString(OPERATOR_KEY_STR);
  const client = Client.forTestnet();
  client.setOperator(OPERATOR_ID, operatorKey);
  
  // INCREASED FEE FOR TOKEN CREATION (0.5 HBAR vs 0.1 HBAR for DID)
  client.setDefaultMaxTransactionFee(new Hbar(5));  // 5 HBAR max

  console.log('Step 1: Initializing Hedera Client...');
  console.log(`✓ Connected to Hedera Testnet`);
  console.log(`✓ Operator Account: ${OPERATOR_ID}`);
  console.log(`✓ Max Fee: 5 HBAR (for token creation)`);

  try {
    const tx = await new TokenCreateTransaction()
      .setTokenName("Hydropower REC")
      .setTokenSymbol("HREC")
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(0)
      .setInitialSupply(0)
      .setTreasuryAccountId(OPERATOR_ID)
      .setSupplyKey(operatorKey)
      .setAdminKey(operatorKey)
      .setTokenMemo(`MRV REC - DID: ${DID_TOPIC_ID}`)
      .freezeWith(client)
      .sign(operatorKey);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    const tokenId = receipt.tokenId;

    console.log(`✓ REC Token Created: ${tokenId}`);
    console.log(`✓ HashScan: https://hashscan.io/testnet/token/${tokenId}`);
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
  } finally {
    client.close();
  }
}

createRecToken();
