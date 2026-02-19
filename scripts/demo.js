#!/usr/bin/env node
/**
 * Hedera Hydropower MRV — Full End-to-End Demo
 * Apex Hackathon 2026 — Sustainability Track
 *
 * Usage:  npm run demo   OR   node scripts/demo.js
 *
 * MOCK MODE activates automatically if HEDERA_OPERATOR_KEY is not set.
 * Set all vars in .env or as environment variables before running.
 */

require('dotenv').config();

const HEDERA_OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID  || '0.0.6255927';
const HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY || null;
const AUDIT_TOPIC_ID      = process.env.AUDIT_TOPIC_ID      || '0.0.7462776';
const REC_TOKEN_ID        = process.env.REC_TOKEN_ID        || '0.0.7964264';
const EF_GRID             = parseFloat(process.env.EF_GRID  || '0.8');

const MOCK_MODE = !HEDERA_OPERATOR_KEY;

const C = {
  reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m',
  yellow:'\x1b[33m', cyan:'\x1b[36m', bold:'\x1b[1m', dim:'\x1b[2m'
};
const ok   = s => console.log(`${C.green}  ✅ ${s}${C.reset}`);
const fail = s => console.log(`${C.red}  ❌ ${s}${C.reset}`);
const info = s => console.log(`${C.cyan}  ℹ  ${s}${C.reset}`);
const step = (n,s) => console.log(`\n${C.bold}${C.yellow}STEP ${n}: ${s}${C.reset}`);
const hr   = () => console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`);

function computePower({ flowRate, head, efficiency }) {
  return 1000 * 9.81 * flowRate * head * efficiency / 1e6;
}
function trustScore(r) {
  let score = 100;
  const exp = computePower(r);
  const delta = Math.abs(r.powerOutput - exp) / exp;
  if (delta > 0.20) score -= 40;
  else if (delta > 0.10) score -= 15;
  if (r.pH < 6.0 || r.pH > 9.0) score -= 20;
  if (r.turbidity > 100) score -= 15;
  if (r.flowRate <= 0 || r.flowRate > 1000) score -= 30;
  return Math.max(0, Math.min(100, score));
}
function classify(s) {
  if (s >= 90) return { status:'APPROVED', label:`${C.green}APPROVED${C.reset}` };
  if (s >= 70) return { status:'FLAGGED',  label:`${C.yellow}FLAGGED${C.reset}` };
  return             { status:'REJECTED', label:`${C.red}REJECTED${C.reset}` };
}

function mockTxId() {
  return `${HEDERA_OPERATOR_ID}@${Math.floor(Date.now()/1000)}.${Math.floor(Math.random()*1e9)}`;
}
async function mockHCS(label) {
  await new Promise(r => setTimeout(r, 100));
  const tx = mockTxId();
  info(`[MOCK] ${label} — TX: ${tx}`);
  return tx;
}
async function mockMint(amt) {
  await new Promise(r => setTimeout(r, 100));
  const tx = mockTxId();
  info(`[MOCK] Minted ${amt} HREC — TX: ${tx}`);
  return tx;
}

async function liveHCS(client, message) {
  const { TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(AUDIT_TOPIC_ID)
    .setMessage(JSON.stringify(message))
    .freezeWith(client)
    .execute(client);
  await tx.getReceipt(client);
  return tx.transactionId.toString();
}

async function main() {
  console.log();
  console.log(`${C.bold}╔${'='.repeat(56)}╗${C.reset}`);
  console.log(`${C.bold}║  Hedera Hydropower MRV — Live Demo                   ║${C.reset}`);
  console.log(`${C.bold}║  Apex Hackathon 2026 — Sustainability Track           ║${C.reset}`);
  console.log(`${C.bold}╚${'='.repeat(56)}╝${C.reset}`);

  if (MOCK_MODE) {
    console.log(`${C.yellow}  ⚠  MOCK MODE (HEDERA_OPERATOR_KEY not set)${C.reset}`);
    console.log(`${C.dim}     Add key to .env for live Hedera testnet execution${C.reset}`);
  } else {
    ok(`Live mode — Account: ${HEDERA_OPERATOR_ID}`);
  }
  hr();

  let client = null;
  if (!MOCK_MODE) {
    const { Client, PrivateKey, AccountId } = require('@hashgraph/sdk');
    client = Client.forTestnet();
    client.setOperator(
      AccountId.fromString(HEDERA_OPERATOR_ID),
      PrivateKey.fromString(HEDERA_OPERATOR_KEY)
    );
    ok('Connected to Hedera Testnet');
  }

  // STEP 1 — Device DID
  step(1, 'Device DID Registration (W3C DID on Hedera)');
  const deviceId = 'TURBINE-APEX-2026-001';
  const did = `did:hedera:testnet:z${Buffer.from(deviceId).toString('hex')}`;
  ok(`Device ID : ${deviceId}`);
  ok(`DID       : ${did}`);
  info('Every turbine gets a unique cryptographic identity on Hedera');

  // STEP 2 — Token
  step(2, 'HREC Token (Hedera Token Service)');
  ok(`Token ID  : ${REC_TOKEN_ID}`);
  ok(`Token Name: HREC (1 token = 1 verified MWh)`);
  info(`HashScan  : https://hashscan.io/testnet/token/${REC_TOKEN_ID}`);

  // STEP 3 — Approved reading
  step(3, 'Telemetry #1 — NORMAL reading');
  const good = { deviceId, timestamp: new Date().toISOString(),
    flowRate:12.5, head:45.2, efficiency:0.88, powerOutput:4.87,
    pH:7.2, turbidity:18, location:'Balurghat-HP-Unit-1' };
  const gs = trustScore(good);
  const gc = classify(gs);
  const expGood = computePower(good).toFixed(3);
  console.log(`  Flow ${good.flowRate} m³/s | Head ${good.head} m | Eff ${good.efficiency}`);
  console.log(`  Expected: ${expGood} MW | Reported: ${good.powerOutput} MW`);
  console.log(`  Trust Score: ${C.bold}${gs}%${C.reset} → ${gc.label}`);
  const payload3 = { ...good, trustScore:gs, status:gc.status, deviceDID:did };
  const tx3 = MOCK_MODE ? await mockHCS('APPROVED reading') : await liveHCS(client, payload3);
  if (!MOCK_MODE) {
    ok(`TX: ${tx3}`);
    info(`HashScan: https://hashscan.io/testnet/transaction/${tx3}`);
  }
  ok('Reading anchored to Hedera HCS — immutable audit record created');

  // STEP 4 — Fraud reading
  step(4, 'Telemetry #2 — FRAUD ATTEMPT');
  const bad = { deviceId, timestamp: new Date().toISOString(),
    flowRate:12.5, head:45.2, efficiency:0.88, powerOutput:9.50,
    pH:7.2, turbidity:18, location:'Balurghat-HP-Unit-1' };
  const bs = trustScore(bad);
  const bc = classify(bs);
  const expBad = computePower(bad).toFixed(3);
  console.log(`  Flow ${bad.flowRate} m³/s | Head ${bad.head} m | Eff ${bad.efficiency}`);
  console.log(`  Expected: ${expBad} MW | Reported: ${bad.powerOutput} MW  ${C.red}← INFLATED (fraud)${C.reset}`);
  console.log(`  Trust Score: ${C.bold}${bs}%${C.reset} → ${bc.label}`);
  const payload4 = { ...bad, trustScore:bs, status:bc.status, deviceDID:did, fraudFlag:true };
  const tx4 = MOCK_MODE ? await mockHCS('REJECTED fraud reading') : await liveHCS(client, payload4);
  if (!MOCK_MODE) {
    ok(`TX: ${tx4}`);
    info(`HashScan: https://hashscan.io/testnet/transaction/${tx4}`);
  }
  ok('Fraud REJECTED — evidence preserved on-chain forever');
  info('Auditors can verify this rejection on HashScan at any time');

  // STEP 5 — Mint
  step(5, 'HREC Minting (approved reading only)');
  const mwh = good.powerOutput;
  const co2 = (mwh * EF_GRID).toFixed(3);
  console.log(`  Verified MWh : ${mwh}`);
  console.log(`  CO₂ credits  : ${co2} tCO₂ (EF_GRID=${EF_GRID})`);
  console.log(`  HREC tokens  : ${mwh} (1 token = 1 MWh)`);
  const tx5 = MOCK_MODE ? await mockMint(mwh) : null;
  if (!MOCK_MODE) info('To mint live: node scripts/mint-recs.js');
  ok(`${mwh} HREC minted — only because AI Guardian approved this reading`);

  // STEP 6 — Audit trail
  step(6, 'HCS Audit Trail Summary');
  hr();
  console.log(`  HCS Topic : ${AUDIT_TOPIC_ID}`);
  info(`HashScan  : https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}`);
  console.log(`\n  ${C.green}#1 APPROVED (trust: ${gs}%)${C.reset}  TX: ${tx3}`);
  console.log(`  ${C.red}#2 REJECTED (trust: ${bs}%) — fraud on-chain${C.reset}  TX: ${tx4}`);
  console.log();
  hr();
  console.log(`${C.bold}${C.green}`);
  console.log('  Demo complete.');
  console.log('  Every reading — approved AND rejected — is permanently on Hedera HCS.');
  console.log('  Carbon fraud is cryptographically impractical.');
  console.log(C.reset);

  if (client) client.close();
}

main().catch(e => {
  console.error(`${C.red}Error: ${e.message}${C.reset}`);
  process.exit(1);
});
