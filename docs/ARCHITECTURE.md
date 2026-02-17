# Architecture — Hedera Hydropower MRV

## System Overview

```text
[IoT Sensor / Manual Entry]
│
▼
[MRV Engine v1] ←──── device config + capacity profile
│
▼
[AI Guardian Verifier]
├── Physics Validator (P = ρ·g·Q·H·η)
├── Temporal Consistency (monotonic timestamp + Δ bounds)
├── Environmental Bounds (pH, turbidity, temperature, flow)
└── Statistical Anomaly (z-score > 3 = outlier)
│
├── Trust Score [0.0 – 1.0]
└── Decision: APPROVED / FLAGGED / REJECTED
│
┌─────────▼──────────┐
│ Hedera Network │
│ ┌──────────────┐ │
│ │ HCS Topic │ │ ← Immutable audit log
│ │ 0.0.7964262 │ │ (ALL readings, any status)
│ └──────────────┘ │
│ ┌──────────────┐ │
│ │ HTS Token │ │ ← HREC minted ONLY on APPROVED
│ │ 0.0.7964264 │ │
│ └──────────────┘ │
│ ┌──────────────┐ │
│ │ Device DID │ │ ← W3C DID for each sensor
│ └──────────────┘ │
└────────────────────┘
```

## Components

### MRV Engine v1 (`src/engine/v1/engine-v1.js`)
- Entry point for all telemetry submissions
- Manages workflow state: initialize → submit → aggregate
- Coordinates verifier, Hedera client, attestation store
- Exposes: `initialize()`, `submitReading()`, `generateMonitoringReport()`, `deployDeviceDID()`, `createRECToken()`

### AI Guardian Verifier (`src/verifier/`)
- **Physics check**: Computes expected power `P = ρ·g·Q·H·η` and compares to reported `generatedKwh`
- **Temporal check**: Ensures timestamps increase monotonically; flags unrealistic Δ between consecutive readings of the same device
- **Environmental bounds**: pH 6.5–8.5, turbidity 0–50 NTU, temperature 0–35°C, flow rate within device profile
- **Statistical anomaly**: Maintains rolling history per device; z-score > 3 triggers OUTLIER flag
- Combines all check results into weighted trust score [0.0–1.0]
- Thresholds: ≥ 0.90 → APPROVED, 0.70–0.89 → FLAGGED, < 0.70 → REJECTED

### Anomaly Detector (`src/anomaly/`)
- Stateless validation functions (pure, deterministic, unit-testable)
- Consumed by AI Guardian Verifier
- Physics constants: ρ = 997 kg/m³ (water), g = 9.81 m/s²

### Hedera Client (`src/hedera/`)
- Wraps `@hashgraph/sdk`
- HCS: `createTopic()`, `submitMessage()`, `getMessages()`
- HTS: `createToken()`, `mintTokens()`, `transferTokens()`, `burnTokens()`
- DID: `deployDeviceDID()` — creates HCS topic as DID document anchor
- Retry logic: exponential backoff on network errors

### Attestation Store (`src/verifier/attestation.js`)
- In-memory store (exportable to JSON)
- Every reading creates an attestation with: deviceId, period, status, trustScore, checks, ACM0002 calculations, cryptographic signature, timestamp
- ACM0002 baseline: `baselineEmissions = generatedKwh × gridEmissionFactor`
- REC issuance: `1 REC = 1 MWh` approved generation

## Data Flow — Single Reading

```text
submitReading(telemetry)
  → ConfigValidator validates telemetry schema
  → AnomalyDetector runs all 4 checks → ValidationResult
  → AIGuardianVerifier computes trust score → AttestationRecord
  → AttestationRecord stored in AttestationStore
  → If APPROVED: HTS.mintTokens(MWh amount)
  → HCS.submitMessage(JSON.stringify(attestation)) ← always, any status
  → Return { status, trustScore, attestationId, transactionId }
```

## Scalability Notes

- 1000 readings processed in ~20 seconds (tested)
- Hedera HCS handles 10,000+ TPS
- Attestation store is in-memory; production should use persistent DB (Supabase / PostgreSQL)
- Device profile cache prevents repeated DB lookups

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18 |
| Blockchain | Hedera Hashgraph (HCS + HTS + DID) |
| SDK | @hashgraph/sdk |
| Testing | Jest (unit + integration + E2E) |
| Identity | W3C DID via Hedera |
| Methodology | ACM0002 (UNFCCC/Verra) |
| Evidence | HashScan explorer |