# Security Model — Hedera Hydropower MRV

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Fake sensor data | Physics validator rejects readings that violate P = ρ·g·Q·H·η |
| Replay attacks | Monotonic timestamp check — duplicate/old timestamps rejected |
| Data tampering in transit | HCS stores SHA-256 hash of payload; any change invalidates |
| Phantom REC minting | HTS minting gated exclusively by APPROVED attestation status |
| Compromised operator key | Rotate key via Hedera account update; old transactions remain immutable |
| Statistical fraud (slow inflation) | Rolling z-score history per device detects gradual drift |

## Key Management

- Operator private key stored in `.env` — NEVER committed to repository
- `.gitignore` includes `.env` — enforced
- CI pipeline uses GitHub Actions Secrets — encrypted at rest
- For production: use Hedera Key Management Service or HSM

## What Is On-Chain (Public)

All data submitted to Hedera HCS is **public and permanent**:
- Attestation ID
- Device DID
- Trust score
- Verification status
- ACM0002 calculations
- Timestamp

Sensitive telemetry values (raw sensor readings) should be hashed before HCS submission in production.

## What Is NOT Stored On-Chain

- Raw private keys
- Operator account seed phrases
- PII of project operators

## Audit Trail Guarantees

1. Every reading (APPROVED, FLAGGED, REJECTED) is submitted to HCS
2. HCS records are immutable — cannot be deleted or modified
3. Timestamps are Hedera consensus timestamps — tamper-proof
4. Any verifier can retrieve full history via mirror node API

## Responsible Disclosure

To report a security issue: open a private GitHub Security Advisory on this repository.