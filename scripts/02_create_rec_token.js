// code/playground/02_create_rec_token.js
// Create Hedera Token for Renewable Energy Credits (RECs)

const {
  Client,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  PrivateKey,
  AccountId,
  Hbar
} = require('@hashgraph/sdk');
require('dotenv').config();

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY_STR = process.env.HEDERA_OPERATOR_KEY;

if (!OPERATOR_ID || !OPERATOR_KEY_STR) {
  throw new Error("Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env");
}

const operatorKey = PrivateKey.fromString(OPERATOR_KEY_STR);
const client = Client.forTestnet();
client.setOperator(AccountId.fromString(OPERATOR_ID), operatorKey);
client.setDefaultMaxTransactionFee(new Hbar(100));

async function createRECToken() {
  console.log("\n=== Creating REC Token ===");

  const tokenCreateTx = await new TokenCreateTransaction()
    .setTokenName("Himalayan Hydropower REC")
    .setTokenSymbol("HH-REC")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(6) // 6 decimals for tCO2 precision
    .setInitialSupply(0) // Start with 0, mint as RECs are verified
    .setTreasuryAccountId(OPERATOR_ID)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(operatorKey)
    .setAdminKey(operatorKey)
    .setFreezeKey(operatorKey)
    .setWipeKey(operatorKey)
    .setTokenMemo("Renewable Energy Credits from ACM0002 verified hydropower generation")
    .freezeWith(client);

  const tokenCreateSign = await tokenCreateTx.sign(operatorKey);
  const tokenCreateSubmit = await tokenCreateSign.execute(client);
  const tokenCreateReceipt = await tokenCreateSubmit.getReceipt(client);
  const tokenId = tokenCreateReceipt.tokenId.toString();

  console.log(`✓ REC Token created: ${tokenId}`);
  console.log(`  Name: Himalayan Hydropower REC`);
  console.log(`  Symbol: HH-REC`);
  console.log(`  Decimals: 6`);
  console.log(`  Supply Type: Infinite`);
  console.log(`  Treasury: ${OPERATOR_ID}`);

  return tokenId;
}

async function main() {
  try {
    console.log("\n🪙 HEDERA HYDROPOWER MRV - REC TOKEN CREATION");
    console.log("=============================================");

    const tokenId = await createRECToken();

    console.log("\n=== SAVE THIS VALUE ===");
    console.log(`REC_TOKEN_ID=${tokenId}`);
    console.log("\nAdd REC_TOKEN_ID to your .env file!");

    console.log("\n✓ REC Token Creation Complete!");
    console.log("\nNext steps:");
    console.log("  1. Update .env with REC_TOKEN_ID");
    console.log("  2. Run telemetry submission: node code/playground/03_submit_telemetry.js");
    console.log("  3. Mint RECs after verification: node scripts/mint-recs.js");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }

  await client.close();
}

main();
