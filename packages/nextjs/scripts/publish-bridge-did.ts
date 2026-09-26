/**
 * Publishes the Guardian bridge's did:hedera DID the way Guardian 3.7.0 does, so any Guardian instance can resolve it
 * with its RemoteDidLoader (first "DID-Document" message on the DID's topic → IPFS cid → DID document).
 *
 *   yarn guardian:publish-did                 dry run (default): prints the topic transaction, DID, DID document
 *                                             and HCS message with placeholders. Sends nothing, pins nothing.
 *   yarn guardian:publish-did --generate-key  also writes a fresh Ed25519 key to .secrets/bridge-ed25519.key (gitignored)
 *   yarn guardian:publish-did --send          creates the topic, pins the DID document to Filebase and posts the message
 *
 * Env (from .env.local or the shell):
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY   payer for the topic and message (--send only)
 *   BRIDGE_ED25519_PRIVATE_KEY                 the bridge key (DER or raw hex, Ed25519); becomes the topic submit key
 *   HEDERA_NETWORK                             testnet (default) | mainnet
 *   FILEBASE_IPFS_RPC_TOKEN                    Filebase bucket access token for the IPFS RPC API (--send only)
 *   BRIDGE_DID_TOPIC_ID                        optional: reuse an existing topic instead of creating one
 *
 * The topic's submit key is the bridge key, so nobody else can post an earlier "DID-Document" message for this DID.
 * Cost on testnet: one TopicCreate (~0.01 HBAR) and one ConsensusSubmitMessage (~0.0008 HBAR).
 */
import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  type HederaNetwork,
  buildDid,
  buildDidDocument,
  buildDidMessage,
  parseBridgeKey,
} from "~~/services/mrv/guardian/did";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const FILEBASE_RPC = "https://rpc.filebase.io/api/v0/add?cid-version=1";
const SECRET_FILE = resolve(".secrets/bridge-ed25519.key");
const PLACEHOLDER_TOPIC = "0.0.0";
const PLACEHOLDER_CID = "<cid-returned-by-filebase>";

function parseOperatorKey(value: string): PrivateKey {
  const trimmed = value.trim().replace(/^0x/, "");
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return PrivateKey.fromStringECDSA(trimmed);
  return PrivateKey.fromStringDer(trimmed);
}

function loadBridgeKey(generate: boolean): PrivateKey {
  if (process.env.BRIDGE_ED25519_PRIVATE_KEY) return parseBridgeKey(process.env.BRIDGE_ED25519_PRIVATE_KEY);
  if (existsSync(SECRET_FILE)) return parseBridgeKey(readFileSync(SECRET_FILE, "utf8"));
  if (!generate) {
    throw new Error(
      "Set BRIDGE_ED25519_PRIVATE_KEY, or run with --generate-key to create one in .secrets/ (gitignored)",
    );
  }
  const key = PrivateKey.generateED25519();
  mkdirSync(resolve(".secrets"), { recursive: true });
  writeFileSync(SECRET_FILE, key.toStringDer() + "\n", { mode: 0o600 });
  console.log(`Generated a new Ed25519 bridge key in ${SECRET_FILE} (mode 600). Back it up; never commit it.`);
  return key;
}

async function pinToFilebase(token: string, name: string, body: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([body], { type: "application/json" }), name);
  const response = await fetch(FILEBASE_RPC, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Filebase pin failed: HTTP ${response.status} ${await response.text()}`);
  const { Hash } = (await response.json()) as { Hash?: string };
  if (!Hash) throw new Error("Filebase response had no Hash");
  return Hash;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const send = args.has("--send");
  const network = (process.env.HEDERA_NETWORK || "testnet") as HederaNetwork;
  if (!["testnet", "mainnet", "previewnet"].includes(network)) throw new Error(`Unknown HEDERA_NETWORK ${network}`);

  const bridgeKey = loadBridgeKey(args.has("--generate-key"));
  console.log(`Mode:            ${send ? "SEND (real transactions)" : "dry run (nothing is sent or pinned)"}`);
  console.log(`Network:         ${network}`);
  console.log(`Bridge pubkey:   ${bridgeKey.publicKey.toStringRaw()}`);

  let client: Client | null = null;
  if (send) {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    const token = process.env.FILEBASE_IPFS_RPC_TOKEN;
    const missing = [
      !operatorId && "HEDERA_OPERATOR_ID",
      !operatorKey && "HEDERA_OPERATOR_KEY",
      !token && "FILEBASE_IPFS_RPC_TOKEN",
    ];
    if (missing.some(Boolean)) throw new Error(`--send needs ${missing.filter(Boolean).join(", ")}`);
    client = (
      network === "mainnet"
        ? Client.forMainnet()
        : network === "previewnet"
          ? Client.forPreviewnet()
          : Client.forTestnet()
    ).setOperator(AccountId.fromString(operatorId!), parseOperatorKey(operatorKey!));
  }

  // 1. Topic (submit key = bridge key).
  let topicId = process.env.BRIDGE_DID_TOPIC_ID || PLACEHOLDER_TOPIC;
  const memo = "Guardian bridge DID (hydro dMRV)";
  if (!process.env.BRIDGE_DID_TOPIC_ID) {
    console.log(`\n[1] TopicCreateTransaction  memo="${memo}"  submitKey=bridge public key`);
    if (client) {
      const tx = await new TopicCreateTransaction()
        .setTopicMemo(memo)
        .setSubmitKey(bridgeKey.publicKey)
        .execute(client);
      const receipt = await tx.getReceipt(client);
      topicId = receipt.topicId!.toString();
      console.log(`    created ${topicId} (tx ${tx.transactionId.toString()})`);
    } else {
      console.log(`    (dry run: topic id shown as ${PLACEHOLDER_TOPIC})`);
    }
  } else {
    console.log(`\n[1] Reusing topic ${topicId}`);
  }

  // 2. DID and DID document, pinned to IPFS.
  const did = buildDid(bridgeKey, network, topicId);
  const document = buildDidDocument(did, bridgeKey);
  const documentJson = JSON.stringify(document);
  console.log(`\n[2] DID document (pinned to Filebase as did-document.json):\n${JSON.stringify(document, null, 2)}`);
  let cid = PLACEHOLDER_CID;
  if (send) {
    cid = await pinToFilebase(process.env.FILEBASE_IPFS_RPC_TOKEN!, "did-document.json", documentJson);
    console.log(`    pinned: ${cid}`);
  }

  // 3. Guardian DID-Document message.
  const message = buildDidMessage(randomUUID(), did, cid);
  console.log(
    `\n[3] TopicMessageSubmitTransaction on ${topicId} (signed by the bridge key):\n${JSON.stringify(message, null, 2)}`,
  );
  if (client) {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicId))
      .setMessage(JSON.stringify(message))
      .freezeWith(client);
    const signed = await tx.sign(bridgeKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`    sequence ${receipt.topicSequenceNumber?.toString()} (tx ${response.transactionId.toString()})`);
    client.close();
  }

  console.log(
    `\nSet on the server (e.g. Vercel env):\n  BRIDGE_DID=${did}\n  BRIDGE_ED25519_PRIVATE_KEY=<the key above, never commit it>`,
  );
  console.log(
    `Check resolution: https://${network}.mirrornode.hedera.com/api/v1/topics/${topicId}/messages and https://ipfs.io/ipfs/${cid}`,
  );
  if (!send) console.log("\nDry run only. Re-run with --send to create the topic, pin and post.");
}

main().catch(error => {
  console.error((error as Error).message);
  process.exit(1);
});
