# API Reference — Hedera Hydropower MRV

## Base URL

```
http://localhost:3000/api/v1
```

---

## Authentication

All endpoints (except `/health`) require an API key in the request header:

```
x-api-key: your-api-key-here
```

> **Production:** Replace with OAuth2/OIDC. See `docs/security/SECURITY.md`.

---

## Endpoints

### GET /health

Health check. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-19T04:00:00.000Z"
}
```

---

### POST /telemetry

Submit a sensor reading for MRV verification.

**Request body:**
```json
{
  "deviceId": "TURBINE-1",
  "flowRate": 2.5,
  "head": 45.0,
  "efficiency": 0.88,
  "generatedKwh": 0.96,
  "timestamp": 1700000000000,
  "pH": 7.2,
  "turbidity": 12,
  "temperature": 18
}
```

**Response (APPROVED):**
```json
{
  "status": "APPROVED",
  "trustScore": 1.0,
  "attestationId": "att-1771367527708-iq9pc9uax",
  "transactionId": "0.0.6255927@1771367521.991650439"
}
```

**Response (REJECTED):**
```json
{
  "status": "REJECTED",
  "trustScore": 0.37,
  "attestationId": "att-xxx",
  "reasons": ["physics_violation"]
}
```

**Error (400):**
```json
{ "error": "deviceId is required" }
```

---

### GET /attestations

Retrieve stored attestations.

**Response:**
```json
{
  "attestations": [...],
  "total": 103
}
```

---

## Physics Validation

The engine validates every reading against the hydropower equation:

```
P = ρ · g · Q · H · η
```

Where:
- P = power (kW)
- ρ = 997 kg/m³
- g = 9.81 m/s²
- Q = flow rate (m³/s)
- H = head (m)
- η = efficiency (0–1)

| Deviation | Trust impact |
|-----------|-------------|
| < 5% | 1.00 (PERFECT) |
| 5–10% | 0.95 (EXCELLENT) |
| 10–15% | 0.85 (GOOD) |
| 15–20% | 0.70 (ACCEPTABLE) |
| 20–30% | 0.50 (QUESTIONABLE) |
| > 30% | 0.00 (FAIL) |
