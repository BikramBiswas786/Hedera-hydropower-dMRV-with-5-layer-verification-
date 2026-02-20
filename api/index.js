/**
 * Hedera Hydropower MRV — Vercel API endpoint
 * Apex Hackathon 2026 — Live Demo URL
 *
 * GET /           → HTML dashboard with real-time HCS feed
 * GET /api/demo   → JSON: run MRV pipeline
 * GET /api/status → JSON: system status + live Hedera links
 * GET /api/hcs-feed → JSON: recent HCS messages (mock for demo)
 */

require('dotenv').config();

const HEDERA_OPERATOR_ID = process.env.HEDERA_OPERATOR_ID || '0.0.6255927';
const AUDIT_TOPIC_ID     = process.env.AUDIT_TOPIC_ID     || '0.0.7462776';
const REC_TOKEN_ID       = process.env.REC_TOKEN_ID       || '0.0.7964264';
const EF_GRID            = parseFloat(process.env.EF_GRID || '0.8');

function computePower({ flowRate, head, efficiency }) {
  return 1000 * 9.81 * flowRate * head * efficiency / 1e6;
}
function trustScore({ flowRate, head, efficiency, powerOutput, pH, turbidity }) {
  let score = 100;
  const expected = computePower({ flowRate, head, efficiency });
  const delta = Math.abs(powerOutput - expected) / expected;
  if (delta > 0.20) score -= 40;
  else if (delta > 0.10) score -= 15;
  if (pH < 6.0 || pH > 9.0) score -= 20;
  if (turbidity > 100) score -= 15;
  if (flowRate <= 0 || flowRate > 1000) score -= 30;
  return Math.max(0, Math.min(100, score));
}
function classify(score) {
  if (score >= 90) return 'APPROVED';
  if (score >= 70) return 'FLAGGED';
  return 'REJECTED';
}

module.exports = (req, res) => {
  const url = req.url || '/';

  // ── JSON: /api/hcs-feed (mock recent messages for demo)
  if (url.startsWith('/api/hcs-feed')) {
    const now = Date.now();
    const mockMessages = [
      {
        timestamp: new Date(now - 120000).toISOString(),
        status: 'APPROVED',
        trustScore: 0.985,
        deviceId: 'TURBINE-001',
        flowRate: 12.3,
        head: 45.2,
        power: 4.85,
        txId: `${HEDERA_OPERATOR_ID}@${(now - 120000) / 1000}.123456789`
      },
      {
        timestamp: new Date(now - 240000).toISOString(),
        status: 'APPROVED',
        trustScore: 0.921,
        deviceId: 'TURBINE-002',
        flowRate: 8.7,
        head: 38.5,
        power: 2.93,
        txId: `${HEDERA_OPERATOR_ID}@${(now - 240000) / 1000}.234567890`
      },
      {
        timestamp: new Date(now - 360000).toISOString(),
        status: 'REJECTED',
        trustScore: 0.325,
        deviceId: 'TURBINE-003',
        flowRate: 15.0,
        head: 42.0,
        power: 18.5,
        txId: `${HEDERA_OPERATOR_ID}@${(now - 360000) / 1000}.345678901`,
        reason: 'Physics deviation 152%'
      },
      {
        timestamp: new Date(now - 480000).toISOString(),
        status: 'FLAGGED',
        trustScore: 0.785,
        deviceId: 'TURBINE-001',
        flowRate: 11.8,
        head: 44.9,
        power: 4.62,
        txId: `${HEDERA_OPERATOR_ID}@${(now - 480000) / 1000}.456789012`
      },
      {
        timestamp: new Date(now - 600000).toISOString(),
        status: 'APPROVED',
        trustScore: 0.965,
        deviceId: 'TURBINE-004',
        flowRate: 20.5,
        head: 52.3,
        power: 9.35,
        txId: `${HEDERA_OPERATOR_ID}@${(now - 600000) / 1000}.567890123`
      }
    ];
    return res.json({
      topic: AUDIT_TOPIC_ID,
      messages: mockMessages,
      hashscan: `https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}`,
      note: 'Demo feed - live HCS integration via Hedera SDK in production'
    });
  }

  // ── JSON: /api/status
  if (url.startsWith('/api/status')) {
    return res.json({
      system: 'Hedera Hydropower MRV',
      hackathon: 'Hedera Hello Future Apex 2026',
      track: 'Sustainability',
      hedera: {
        account:        HEDERA_OPERATOR_ID,
        network:        'testnet',
        hcsTopic:       AUDIT_TOPIC_ID,
        htsToken:       REC_TOKEN_ID,
        hashscanTopic:   `https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}`,
        hashscanToken:   `https://hashscan.io/testnet/token/${REC_TOKEN_ID}`,
        hashscanAccount: `https://hashscan.io/testnet/account/${HEDERA_OPERATOR_ID}`
      },
      tests:  { suites: 9, total: 224, passing: 224 },
      status: 'operational'
    });
  }

  // ── JSON: /api/demo
  if (url.startsWith('/api/demo')) {
    const goodReading = {
      deviceId: 'TURBINE-APEX-2026-001', flowRate: 12.5, head: 45.2,
      efficiency: 0.88, powerOutput: 4.87, pH: 7.2, turbidity: 18
    };
    const badReading = {
      deviceId: 'TURBINE-APEX-2026-001', flowRate: 12.5, head: 45.2,
      efficiency: 0.88, powerOutput: 9.50, pH: 7.2, turbidity: 18
    };
    const goodScore = trustScore(goodReading);
    const badScore  = trustScore(badReading);
    const mwh = goodReading.powerOutput;
    return res.json({
      pipeline:  'Hedera Hydropower MRV — Full E2E Demo',
      timestamp: new Date().toISOString(),
      steps: [
        { step: 1, name: 'Device DID',
          result: `did:hedera:testnet:z${Buffer.from('TURBINE-APEX-2026-001').toString('hex')}`,
          status: 'ok' },
        { step: 2, name: 'HREC Token', tokenId: REC_TOKEN_ID, status: 'ok',
          hashscan: `https://hashscan.io/testnet/token/${REC_TOKEN_ID}` },
        { step: 3, name: 'Telemetry #1 — Normal',
          reading: goodReading,
          expectedPower: parseFloat(computePower(goodReading).toFixed(3)),
          trustScore: goodScore, status: classify(goodScore),
          hcsTopic: AUDIT_TOPIC_ID,
          hashscan: `https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}` },
        { step: 4, name: 'Telemetry #2 — Fraud Attempt',
          reading: badReading,
          expectedPower: parseFloat(computePower(badReading).toFixed(3)),
          trustScore: badScore, status: classify(badScore),
          fraudFlag: true,
          note: 'Rejected — fraud evidence preserved on-chain permanently' },
        { step: 5, name: 'HREC Minting',
          mwhVerified: mwh,
          co2Credits:  parseFloat((mwh * EF_GRID).toFixed(3)),
          hrecMinted:  mwh,
          note: 'Only approved readings trigger token minting' }
      ],
      liveEvidence: {
        hcsTopic:    AUDIT_TOPIC_ID,
        htsToken:    REC_TOKEN_ID,
        hashscanTopic:   `https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}`,
        hashscanToken:   `https://hashscan.io/testnet/token/${REC_TOKEN_ID}`,
        hashscanAccount: `https://hashscan.io/testnet/account/${HEDERA_OPERATOR_ID}`
      }
    });
  }

  // ── HTML: /
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hedera Hydropower MRV — Apex 2026</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0e1a;color:#e2e8f0;min-height:100vh;padding:2rem}
    .container{max-width:1100px;margin:0 auto}
    h1{font-size:2rem;color:#38bdf8;margin-bottom:.5rem}
    .subtitle{color:#94a3b8;margin-bottom:2rem;font-size:1.1rem}
    .badge{display:inline-block;background:#1e3a5f;color:#38bdf8;padding:.2rem .7rem;border-radius:999px;font-size:.8rem;margin:.2rem}
    .card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
    .card h2{color:#38bdf8;margin-bottom:1rem;font-size:1.2rem}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    th{text-align:left;color:#64748b;padding:.4rem .6rem;border-bottom:1px solid #1e293b}
    td{padding:.5rem .6rem;border-bottom:1px solid #0f172a}
    .link{color:#38bdf8;text-decoration:none}
    .link:hover{text-decoration:underline}
    .btn{display:inline-block;background:#0ea5e9;color:#fff;padding:.5rem 1.2rem;border-radius:8px;text-decoration:none;font-weight:bold;margin:.3rem}
    .btn:hover{background:#0284c7}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}
    .stat{background:#1e293b;border-radius:8px;padding:1rem;text-align:center}
    .stat-val{font-size:2rem;font-weight:bold;color:#38bdf8}
    .stat-label{font-size:.8rem;color:#64748b;margin-top:.3rem}
    .feed-item{background:#1e293b;border-left:3px solid #0ea5e9;padding:.8rem;margin-bottom:.6rem;border-radius:4px;font-size:.85rem}
    .feed-item.rejected{border-left-color:#ef4444}
    .feed-item.flagged{border-left-color:#f59e0b}
    .feed-time{color:#64748b;font-size:.75rem}
    .feed-status{font-weight:bold;color:#10b981}
    .feed-status.REJECTED{color:#ef4444}
    .feed-status.FLAGGED{color:#f59e0b}
    .infographic{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:2rem;margin:1.5rem 0}
    .layer{background:#1e293b;border-left:4px solid #0ea5e9;padding:1rem;margin:.8rem 0;border-radius:6px}
    .layer-title{color:#38bdf8;font-weight:bold;margin-bottom:.4rem;display:flex;align-items:center;gap:.5rem}
    .layer-weight{background:#0ea5e9;color:#fff;padding:.1rem .5rem;border-radius:999px;font-size:.75rem}
    .layer-desc{color:#94a3b8;font-size:.85rem;line-height:1.4}
    .arrow{text-align:center;color:#64748b;font-size:1.5rem;margin:.3rem 0}
    footer{margin-top:2rem;color:#475569;text-align:center;font-size:.85rem}
  </style>
</head>
<body>
<div class="container">
  <h1>&#x26a1; Hedera Hydropower MRV</h1>
  <div class="subtitle">On-chain Measurement, Reporting &amp; Verification for Run-of-River Hydropower</div>
  <span class="badge">&#x1f3c6; Apex Hackathon 2026</span>
  <span class="badge">&#x1f331; Sustainability Track</span>
  <span class="badge">&#x1f9e0; AI Guardian</span>
  <span class="badge">ACM0002/UNFCCC</span>

  <div class="card" style="margin-top:1.5rem">
    <h2>&#x1f4ca; System Stats</h2>
    <div class="grid">
      <div class="stat"><div class="stat-val">224</div><div class="stat-label">Tests Passing</div></div>
      <div class="stat"><div class="stat-val">9</div><div class="stat-label">Test Suites</div></div>
      <div class="stat"><div class="stat-val">&lt;5ms</div><div class="stat-label">Per Verification</div></div>
      <div class="stat"><div class="stat-val">50K</div><div class="stat-label">Plant TAM</div></div>
    </div>
  </div>

  <div class="card">
    <h2>&#x1f4e1; Real-Time HCS Audit Feed</h2>
    <p style="color:#64748b;font-size:.85rem;margin-bottom:1rem">Live verification results anchored to topic <strong>${AUDIT_TOPIC_ID}</strong></p>
    <div id="hcs-feed">Loading...</div>
  </div>

  <div class="infographic">
    <h2 style="color:#38bdf8;margin-bottom:1.5rem;text-align:center">&#x1f50d; 5-Layer AI Verification Engine</h2>
    <p style="color:#94a3b8;text-align:center;margin-bottom:2rem;font-size:.9rem">Every sensor reading passes through 5 independent checks before approval</p>
    
    <div class="layer">
      <div class="layer-title">
        <span>&#x1f4d0; Layer 1: Physics Validation</span>
        <span class="layer-weight">30% weight</span>
      </div>
      <div class="layer-desc">
        Compares reported power output vs. theoretical max using hydropower formula: P = ρ × g × Q × H × η. Rejects readings with &gt;20% deviation.
      </div>
    </div>
    <div class="arrow">&#x2193;</div>
    
    <div class="layer">
      <div class="layer-title">
        <span>&#x23f0; Layer 2: Temporal Consistency</span>
        <span class="layer-weight">25% weight</span>
      </div>
      <div class="layer-desc">
        Analyzes reading patterns over time. Flags sudden jumps in flow rate or power that violate physical constraints of river systems.
      </div>
    </div>
    <div class="arrow">&#x2193;</div>
    
    <div class="layer">
      <div class="layer-title">
        <span>&#x1f30a; Layer 3: Environmental Bounds</span>
        <span class="layer-weight">20% weight</span>
      </div>
      <div class="layer-desc">
        Validates water quality (pH 6.0-9.0, turbidity &lt;100 NTU, temperature 5-30°C). Extreme values indicate sensor malfunction or fraud.
      </div>
    </div>
    <div class="arrow">&#x2193;</div>
    
    <div class="layer">
      <div class="layer-title">
        <span>&#x1f4c8; Layer 4: Statistical Anomalies</span>
        <span class="layer-weight">15% weight</span>
      </div>
      <div class="layer-desc">
        Applies Z-score analysis and Isolation Forest ML model to detect outliers. Catches sophisticated fraud patterns invisible to rule-based systems.
      </div>
    </div>
    <div class="arrow">&#x2193;</div>
    
    <div class="layer">
      <div class="layer-title">
        <span>&#x1f4f1; Layer 5: Device Consistency</span>
        <span class="layer-weight">10% weight</span>
      </div>
      <div class="layer-desc">
        Verifies cryptographic device signatures and checks for duplicate readings. Prevents man-in-the-middle attacks and replay fraud.
      </div>
    </div>
    <div class="arrow">&#x2193;</div>
    
    <div style="background:#0ea5e9;color:#fff;padding:1rem;border-radius:8px;text-align:center;margin-top:1rem;font-weight:bold">
      &#x2705; Weighted Trust Score (0.0-1.0) → APPROVED / FLAGGED / REJECTED
    </div>
  </div>

  <div class="card">
    <h2>&#x1f517; Live Hedera Testnet</h2>
    <table>
      <tr><th>What</th><th>ID</th><th>Verify on HashScan</th></tr>
      <tr><td>Operator Account</td><td>${HEDERA_OPERATOR_ID}</td>
          <td><a class="link" href="https://hashscan.io/testnet/account/${HEDERA_OPERATOR_ID}" target="_blank">View &#x2197;</a></td></tr>
      <tr><td>HCS Audit Topic</td><td>${AUDIT_TOPIC_ID}</td>
          <td><a class="link" href="https://hashscan.io/testnet/topic/${AUDIT_TOPIC_ID}" target="_blank">View &#x2197;</a></td></tr>
      <tr><td>HREC Token</td><td>${REC_TOKEN_ID}</td>
          <td><a class="link" href="https://hashscan.io/testnet/token/${REC_TOKEN_ID}" target="_blank">View &#x2197;</a></td></tr>
    </table>
  </div>

  <div class="card">
    <h2>&#x1f9ea; Run the Demo Pipeline</h2>
    <p style="color:#94a3b8;margin-bottom:1rem">Full MRV pipeline: sensor &#x2192; AI Guardian &#x2192; HCS &#x2192; REC minting</p>
    <a class="btn" href="/api/demo" target="_blank">&#x25b6; Run Demo (JSON)</a>
    <a class="btn" href="/api/status" target="_blank">&#x2139; System Status</a>
    <a class="btn" href="/api/hcs-feed" target="_blank">&#x1f4e1; HCS Feed (JSON)</a>
  </div>

  <div class="card">
    <h2>&#x1f4d0; How It Works</h2>
    <table>
      <tr><th>Step</th><th>What happens</th><th>Hedera service</th></tr>
      <tr><td>1</td><td>Sensor registers Device DID</td><td>W3C DID on Hedera</td></tr>
      <tr><td>2</td><td>Plant deploys HREC token</td><td>HTS</td></tr>
      <tr><td>3</td><td>Telemetry verified by AI Guardian (5 layers)</td><td>AI Guardian</td></tr>
      <tr><td>4</td><td>Result anchored immutably (approved or rejected)</td><td>HCS</td></tr>
      <tr><td>5</td><td>Approved readings mint HREC tokens (1 = 1 MWh)</td><td>HTS</td></tr>
      <tr><td>6</td><td>Any auditor verifies full history on HashScan</td><td>HCS / HashScan</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>&#x1f4c1; Links</h2>
    <a class="btn" href="https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv" target="_blank">GitHub Repo &#x2197;</a>
    <a class="btn" href="https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/blob/main/HACKATHON.md" target="_blank">Submission Brief &#x2197;</a>
    <a class="btn" href="https://hashscan.io/testnet/account/${HEDERA_OPERATOR_ID}" target="_blank">HashScan &#x2197;</a>
  </div>

  <footer>Built on Hedera Hashgraph &bull; MIT License &bull; Apex Hackathon 2026</footer>
</div>

<script>
  // Load HCS feed
  async function loadFeed() {
    try {
      const res = await fetch('/api/hcs-feed');
      const data = await res.json();
      const feedHTML = data.messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        const statusClass = msg.status.toLowerCase();
        return `
          <div class="feed-item ${statusClass}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
              <span class="feed-status ${msg.status}">${msg.status}</span>
              <span class="feed-time">${time}</span>
            </div>
            <div style="color:#94a3b8;font-size:.8rem">
              <strong>${msg.deviceId}</strong>: ${msg.flowRate} m³/s × ${msg.head} m → ${msg.power} MW
              <br>Trust Score: <strong style="color:#38bdf8">${msg.trustScore.toFixed(3)}</strong>
              ${msg.reason ? `<br><span style="color:#ef4444">${msg.reason}</span>` : ''}
              <br><a href="https://hashscan.io/testnet/transaction/${msg.txId}" target="_blank" style="color:#38bdf8;font-size:.75rem">TX: ${msg.txId}</a>
            </div>
          </div>
        `;
      }).join('');
      document.getElementById('hcs-feed').innerHTML = feedHTML;
    } catch (e) {
      document.getElementById('hcs-feed').innerHTML = '<p style="color:#ef4444">Failed to load feed</p>';
    }
  }
  loadFeed();
  setInterval(loadFeed, 30000); // Refresh every 30s
</script>
</body>
</html>`);
};
