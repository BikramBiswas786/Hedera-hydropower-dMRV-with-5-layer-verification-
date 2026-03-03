# API Reference

**Base URL (production)**: `https://hydropower-mrv-19feb26.vercel.app`  
**Base URL (local)**: `http://localhost:3000`  
**API version**: v1  
**Authentication**: `x-api-key` header required on all endpoints except `/api/status`.

---

## Authentication

All data-submission endpoints require an API key passed in the request header:

```
x-api-key: <your-api-key>
```

**Important**: API keys are per-operator credentials. Do not share keys between operators or use the demo key (`demokey001`) in any environment that writes real data. The demo key is rate-limited and intended for integration testing only. See [SECURITY.md §API Keys](./SECURITY.md#api-keys) for key management guidance.

Unauthorised requests receive `HTTP 401 Unauthorized`.

---

## Endpoints

### `GET /api/status`

Returns the current health status of the system and its dependencies.

**Authentication**: Not required.

**Response (200)**:
```json
{
  "status": "ok",
  "hedera": {
    "network": "testnet",
    "topic_id": "0.0.7462776",
    "token_id": "0.0.7964264",
    "connected": true
  },
  "redis": {
    "connected": true
  },
  "version": "1.6.1",
  "timestamp": "2026-03-04T01:30:00Z"
}
```

If a dependency is unavailable, its `connected` field is `false` and the top-level `status` is `"degraded"`.

---

### `POST /api/v1/telemetry`

Submits a telemetry reading for verification.

**Authentication**: Required.

**Request body**:
```json
{
  "plant_id":  "PLANT-ALPHA",
  "device_id": "TURBINE-001",
  "readings": {
    "timestamp":    1772566213769,
    "flowRate":     2.5,
    "head":         45,
    "generatedKwh": 900,
    "pH":           7.2,
    "turbidity":    10,
    "temperature":  18,
    "efficiency":   0.85
  }
}
```

**Required fields**: `plant_id`, `device_id`, `readings.timestamp`, `readings.flowRate`, `readings.head`, `readings.generatedKwh`.

**Optional fields**: `readings.pH`, `readings.turbidity`, `readings.temperature`, `readings.efficiency` (default: 0.85).

**Successful response (200)**:
```json
{
  "status":    "APPROVED",
  "trust_score": 0.985,
  "reading_id": "RDG-PLANT-ALPHA-MMB05UKW",
  "verification_details": {
    "physics_check":       "PERFECT",
    "temporal_check":      "PASS",
    "environmental_check": "PASS",
    "statistical_check":   "PASS",
    "device_check":        "PASS",
    "flags":               []
  },
  "carbon_credits": {
    "amount_tco2e": 0.72,
    "methodology":  "ACM0002",
    "hrec_tokens":  0.9
  },
  "hedera": {
    "transaction_id":  "0.0.6255927@1772566213.769819666",
    "hashscan_url":    "https://hashscan.io/testnet/transaction/0.0.6255927@1772566213.769819666",
    "topic_id":        "0.0.7462776"
  }
}
```

**Error responses**:

| Status | Condition |
|---|---|
| 400 Bad Request | Missing required field, invalid data type, or physically impossible reading (e.g. flowRate=0 with generatedKwh>0) |
| 401 Unauthorized | Missing or invalid API key |
| 409 Conflict | Duplicate submission (same plant + device + timestamp already recorded) |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Hedera SDK or internal error |

**Flag values** (returned when status is FLAGGED):

| Flag | Meaning |
|---|---|
| `PHYSICS_VIOLATION` | Reported generation inconsistent with measured water parameters |
| `TEMPORAL_ANOMALY` | Timestamp out of range or generation spike between readings |
| `ENVIRONMENTAL_ANOMALY` | Water quality parameter outside safe operating range |
| `STATISTICAL_ANOMALY` | Reading is a statistical outlier relative to device history |
| `DEVICE_INCONSISTENCY` | Device efficiency ratio outside expected band |
| `LOW_TRUST_SCORE` | Composite trust score is below the APPROVED threshold |

---

### `GET /api/demo`

Runs a 5-step end-to-end demonstration flow without requiring an API key or real sensor hardware.

**Authentication**: Not required.

**What it does**:
1. Submits a normal reading → APPROVED
2. Submits a fraud reading (10× power inflation) → FLAGGED
3. Returns both results with full verification details

**Use this endpoint** to verify the deployment is functioning correctly. Do not use it for automated testing against production data.

---

### `GET /metrics`

Exposes Prometheus-compatible metrics.

**Authentication**: Not required (restrict at network level in production).

Key metrics exposed:
- `mrv_readings_total` — counter by status (APPROVED/FLAGGED/REJECTED)
- `mrv_trust_score_histogram` — distribution of trust scores
- `mrv_hedera_tx_duration_seconds` — HCS submission latency
- `mrv_redis_errors_total` — Redis connectivity errors

---

## Rate Limits

| Key type | Limit |
|---|---|
| Demo key (`demokey001`) | 100 requests / 15 minutes |
| Production key | 1,000 requests / 15 minutes (configurable) |

Exceeded requests receive `HTTP 429` with a `Retry-After` header.

---

## Programmatic Usage

```javascript
const Workflow = require('./src/workflow');

const wf = new Workflow();
await wf.initialize('PROJ-001', 'TURBINE-1', 0.85);

const result = await wf.submitReading({
  flowRate:     2.5,   // m³/s
  head:         45,    // metres
  generatedKwh: 900,   // kWh
  timestamp:    Date.now(),
  pH:           7.2,
  turbidity:    10,
  temperature:  18
});

console.log(result.verificationStatus); // APPROVED
console.log(result.trustScore);         // 0.985
console.log(result.transactionId);      // 0.0.6255927@...
```
