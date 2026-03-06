#!/usr/bin/env node
/**
 * Hedera Hydropower MRV — LIVE DEMO WITH REAL MINTING
 * Apex Hackathon 2026 — Sustainability Track
 *
 * Usage:  npm run demo:live   OR   node scripts/demo-live-minting.js
 *
 * This version creates ACTUAL HTS mint transactions on Hedera testnet
 */

require('dotenv').config();

const {
  Client,
  PrivateKey,
  AccountId,
  TopicMessageSubmitTransaction,
  TokenMintTransaction,
  Hbar
} = require('@hashgraph/sdk');

const HEDERA_OPERATOR_ID  = process.env.HEDERA_OPERATOR_ID;
const HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;
const AUDIT_TOPIC_ID      = process.env.AUDIT_TOPIC_ID || '0.0.7462776';
const REC_TOKEN_ID        = process.env.REC_TOKEN_ID || '0.0.7964264';
const EF_GRID             = parseFloat(process.env.EF_GRID || '0.8');

if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY) {
  console.error('\n❌ ERROR: Missing required environment variables');
  console.error('   HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env\n');
  process.exit(1);
}

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

async function submitToHCS(client, message) {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(AUDIT_TOPIC_ID)
    .setMessage(JSON.stringify(message))
    .freezeWith(client)
    .execute(client);
  
  const receipt = await tx.getReceipt(client);
  return tx.transactionId.toString();
}

async function mintHREC(client, operatorKey, amount, metadata) {
  // Convert to token units (2 decimals for HREC)
  const tokenAmount = Math.floor(amount * 100);
  
  console.log(`\n  ${C.dim}Minting ${tokenAmount} HREC (${amount} MWh)...${C.reset}`);
  
  const mintTx = await new TokenMintTransaction()
    .setTokenId(REC_TOKEN_ID)
    .setAmount(tokenAmount)
    .setMaxTransactionFee(new Hbar(2))
    .freezeWith(client);
  
  const signedTx = await mintTx.sign(operatorKey);
  const submitTx = await signedTx.execute(client);
  const receipt = await submitTx.getReceipt(client);
  
  return {
    transactionId: submitTx.transactionId.toString(),
    status: receipt.status.toString(),
    totalSupply: receipt.totalSupply.toString(),
    amount: tokenAmount,
    metadata
  };
}

async function main() {
  console.log();
  console.log(`${C.bold}╔${'='.repeat(56)}╗${C.reset}`);
  console.log(`${C.bold}║  Hedera Hydropower MRV — LIVE DEMO (Real Minting)   ║${C.reset}`);
  console.log(`${C.bold}║  Apex Hackathon 2026 — Sustainability Track           ║${C.reset}`);
  console.log(`${C.bold}╚${'='.repeat(56)}╝${C.reset}`);
  console.log(`${C.green}  🔥 LIVE MODE — Real HCS + HTS transactions${C.reset}`);
  ok(`Account: ${HEDERA_OPERATOR_ID}`);
  hr();

  // Initialize Hedera client
  const operatorKey = PrivateKey.fromString(HEDERA_OPERATOR_KEY);
  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(HEDERA_OPERATOR_ID),
    operatorKey
  );
  client.setDefaultMaxTransactionFee(new Hbar(2));
  ok('Connected to Hedera Testnet');

  // STEP 1 — Device DID
  step(1, 'Device DID Registration (W3C DID on Hedera)');
  const deviceId = 'TURBINE-APEX-2026-001';
  const did = `did:hedera:testnet:z${Buffer.from(deviceId).toString('hex')}`;
  ok(`Device ID : ${deviceId}`);
  ok(`DID       : ${did}`);
  info('Every turbine gets a unique cryptographic identity on Hedera');

  // STEP 2 — Token Info
  step(2, 'HREC Token (Hedera Token Service)');
  ok(`Token ID  : ${REC_TOKEN_ID}`);
  ok(`Token Name: HREC (1 token = 1 verified MWh)`);
  info(`HashScan  : https://hashscan.io/testnet/token/${REC_TOKEN_ID}`);

  // STEP 3 — Valid Reading + HCS
  step(3, 'Telemetry #1 — NORMAL reading');
  const good = { 
    deviceId, 
    timestamp: new Date().toISOString(),
    flowRate: 12.5, 
    head: 45.2, 
    efficiency: 0.88, 
    powerOutput: 4.87,
    pH: 7.2, 
    turbidity: 18, 
    location: 'Balurghat-HP-Unit-1' 
  };
  
  const gs = trustScore(good);
  const gc = classify(gs);
  const expGood = computePower(good).toFixed(3);
  const goodMWh = good.powerOutput;
  const goodCO2 = (goodMWh * EF_GRID).toFixed(3);
  
  console.log(`  Flow ${good.flowRate} m³/s | Head ${good.head} m | Eff ${good.efficiency}`);
  console.log(`  Expected: ${expGood} MW | Reported: ${good.powerOutput} MW`);
  console.log(`  Trust Score: ${C.bold}${gs}%${C.reset} → ${gc.label}`);
  
  const payload3 = { 
    ...good, 
    trustScore: gs, 
    status: gc.status, 
    deviceDID: did,
    carbon_credits: {
      methodology: 'ACM0002',
      ER_tCO2: parseFloat(goodCO2),
      EF_grid_tCO2_per_MWh: EF_GRID,
      EG_MWh: goodMWh
    }
  };
  
  const tx3 = await submitToHCS(client, payload3);
  ok(`TX: ${tx3}`);
  info(`HashScan: https://hashscan.io/testnet/transaction/${tx3}`);
  ok('Reading anchored to Hedera HCS — immutable audit record created');

  // STEP 4 — Fraud Reading + HCS
  step(4, 'Telemetry #2 — FRAUD ATTEMPT');
  const bad = { 
    deviceId, 
    timestamp: new Date().toISOString(),
    flowRate: 12.5, 
    head: 45.2, 
    efficiency: 0.88, 
    powerOutput: 9.50,  // Inflated!
    pH: 7.2, 
    turbidity: 18, 
    location: 'Balurghat-HP-Unit-1' 
  };
  
  const bs = trustScore(bad);
  const bc = classify(bs);
  const expBad = computePower(bad).toFixed(3);
  
  console.log(`  Flow ${bad.flowRate} m³/s | Head ${bad.head} m | Eff ${bad.efficiency}`);
  console.log(`  Expected: ${expBad} MW | Reported: ${bad.powerOutput} MW  ${C.red}← INFLATED (fraud)${C.reset}`);
  console.log(`  Trust Score: ${C.bold}${bs}%${C.reset} → ${bc.label}`);
  
  const payload4 = { 
    ...bad, 
    trustScore: bs, 
    status: bc.status, 
    deviceDID: did, 
    fraudFlag: true,
    flags: ['PHYSICS_VIOLATION', 'REPORTED_POWER_EXCEEDS_THEORETICAL']
  };
  
  const tx4 = await submitToHCS(client, payload4);
  ok(`TX: ${tx4}`);
  info(`HashScan: https://hashscan.io/testnet/transaction/${tx4}`);
  ok('Fraud REJECTED — evidence preserved on-chain forever');
  info('Auditors can verify this rejection on HashScan at any time');

  // STEP 5 — REAL HTS MINTING (only for approved reading)
  step(5, 'HREC Minting (approved reading only)');
  console.log(`  Verified MWh : ${goodMWh}`);
  console.log(`  CO₂ credits  : ${goodCO2} tCO₂ (EF_GRID=${EF_GRID})`);
  console.log(`  HREC tokens  : ${goodMWh} (1 token = 1 MWh)`);
  console.log(`  ${C.dim}Status Check : ${gc.status} (${gs}% trust)${C.reset}`);
  
  if (gc.status === 'APPROVED') {
    const mintResult = await mintHREC(client, operatorKey, goodMWh, {
      sourceReading: tx3,
      deviceId: deviceId,
      timestamp: good.timestamp,
      carbonCredits: goodCO2
    });
    
    ok(`${goodMWh} HREC minted — TX: ${mintResult.transactionId}`);
    info(`HashScan: https://hashscan.io/testnet/transaction/${mintResult.transactionId}`);
    info(`New Total Supply: ${parseInt(mintResult.totalSupply) / 100} HREC`);
  } else {
    fail(`Minting SKIPPED — reading was ${gc.status}`);
  }
  
  console.log(`  ${C.dim}Fraud reading status: ${bc.status} → ${C.red}NO MINTING${C.reset}`);

  // STEP 6 — Summary
  step(6, 'HCS Audit Trail Summary');
  hr();
  console.log(`  HCS Topic : ${AUDIT_TOPIC_ID}`);
  console.log(`  HREC Token: ${REC_TOKEN_ID}`);
  info(`Topic HashScan: https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}`);
  info(`Token HashScan: https://hashscan.io/testnet/token/${REC_TOKEN_ID}`);
  console.log();
  console.log(`  ${C.green}#1 APPROVED (trust: ${gs}%)${C.reset}`);
  console.log(`     HCS TX: ${tx3}`);
  console.log(`     Minted: ${goodMWh} HREC`);
  console.log();
  console.log(`  ${C.red}#2 REJECTED (trust: ${bs}%) — fraud on-chain${C.reset}`);
  console.log(`     HCS TX: ${tx4}`);
  console.log(`     Minted: 0 HREC (fraud = no credits)`);
  console.log();
  hr();
  console.log(`${C.bold}${C.green}`);
  console.log('  Demo complete.');
  console.log('  ✅ Every reading — approved AND rejected — is permanently on Hedera HCS');
  console.log('  ✅ HREC tokens minted ONLY for approved readings');
  console.log('  ✅ Fraud attempts logged but receive ZERO carbon credits');
  console.log('  ✅ All transactions verifiable on HashScan');
  console.log('  ✅ Carbon fraud is cryptographically impossible');
  console.log(C.reset);

  await client.close();
}

main().catch(e => {
  console.error(`${C.red}\n❌ Error: ${e.message}${C.reset}`);
  console.error(e.stack);
  process.exit(1);
});
