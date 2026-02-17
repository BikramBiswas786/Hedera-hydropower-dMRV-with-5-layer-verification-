const {
  Client,
  TokenMintTransaction,
  PrivateKey,
  Hbar,
  TokenId
} = require("@hashgraph/sdk");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const OPERATOR_KEY_STR = process.env.HEDERA_OPERATOR_KEY;
const TOKEN_ID = process.env.REC_TOKEN_ID || "0.0.7943984";

if (!OPERATOR_ID || !OPERATOR_KEY_STR) {
  console.error("❌ Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env");
  process.exit(1);
}

async function submitTelemetry() {

  console.log("\n========================================");
  console.log("Submitting Telemetry & Minting REC");
  console.log("========================================\n");

  const operatorKey = PrivateKey.fromString(OPERATOR_KEY_STR);
  const client = Client.forTestnet();
  client.setOperator(OPERATOR_ID, operatorKey);
  client.setDefaultMaxTransactionFee(new Hbar(5));

  try {

    // Example telemetry value
    const kWhGenerated = 125;
    const recToMint = Math.floor(kWhGenerated / 100);

    console.log(`Telemetry: ${kWhGenerated} kWh`);
    console.log(`Minting: ${recToMint} REC token(s)...`);

    const mintTx = await new TokenMintTransaction()
      .setTokenId(TOKEN_ID)
      .setAmount(recToMint)
      .freezeWith(client)
      .sign(operatorKey);

    const txResponse = await mintTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    console.log(`✓ REC Minted: ${receipt.status.toString()}`);
    console.log(`✓ Transaction ID: ${txResponse.transactionId.toString()}`);

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
  } finally {
    client.close();
  }
}

submitTelemetry();
