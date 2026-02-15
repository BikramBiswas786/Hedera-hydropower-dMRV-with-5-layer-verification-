const {
  Client,
  TokenMintTransaction,
  PrivateKey,
  Hbar,
  TokenId
} = require("@hashgraph/sdk");

const OPERATOR_ID = "0.0.6255927";
const OPERATOR_KEY_STR = "3030020100300706052b8104000a04220420398637ba54e6311afdc8a2f1a2f1838834dc30ce2d1fec22cb2cddd6ca28fbde";
const TOKEN_ID = "0.0.7943984"; // YOUR REAL TOKEN

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
    console.log(`Minting ${recToMint} REC\n`);

    const mintTx = await new TokenMintTransaction()
      .setTokenId(TokenId.fromString(TOKEN_ID))
      .setAmount(recToMint)
      .freezeWith(client)
      .sign(operatorKey);

    const txResponse = await mintTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    console.log("✅ REC Minted Successfully");
    console.log("Transaction:", txResponse.transactionId.toString());

  } catch (error) {
    console.error("❌ ERROR:", error);
  } finally {
    await client.close();
  }
}

submitTelemetry();
