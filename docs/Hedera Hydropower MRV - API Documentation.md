# Hedera Hydropower MRV - API Documentation

## Overview

This document provides complete API documentation for the Hedera Hydropower MRV system. All endpoints are designed for integration with Hedera Testnet and follow RESTful principles.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Base URL](#base-url)
3. [Endpoints](#endpoints)
4. [Data Models](#data-models)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Examples](#examples)

---

## Authentication

All API requests require authentication using Hedera account credentials.

### Headers

```
Authorization: Bearer <JWT_TOKEN>
X-Hedera-Account-ID: <ACCOUNT_ID>
X-Hedera-Network: testnet
```

### JWT Token Generation

```bash
curl -X POST https://api.hedera-hydropower.local/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "0.0.6255927",
    "privateKey": "YOUR_PRIVATE_KEY"
  }'
```

---

## Base URL

```
https://api.hedera-hydropower.local/v1
```

For Testnet:
```
https://testnet-api.hedera-hydropower.local/v1
```

---

## Endpoints

### 1. Device Management

#### 1.1 Deploy Device DID

**Endpoint**: `POST /devices/deploy-did`

**Description**: Deploy a new device identity to Hedera

**Request Body**:
```json
{
  "deviceId": "TURBINE-1",
  "deviceName": "Main Hydropower Turbine",
  "deviceLocation": "Himachal Pradesh, India",
  "deviceType": "pelton",
  "capacityKw": 100,
  "manufacturer": "Pelton Turbine Co",
  "model": "PT-100-45",
  "serialNumber": "SN-2026-001"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "deviceId": "TURBINE-1",
    "did": "did:hedera:testnet:0.0.7462776",
    "topicId": "0.0.7462776",
    "publicKey": "302a300506032b6570032100...",
    "registrationDate": "2026-01-15T10:00:00Z",
    "status": "active"
  },
  "metadata": {
    "transactionId": "0.0.6255927@1705317600.123456789",
    "hashscanUrl": "https://hashscan.io/testnet/topic/0.0.7462776"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid device parameters
- `401 Unauthorized`: Invalid authentication
- `500 Internal Server Error`: Hedera transaction failed

---

#### 1.2 Get Device Details

**Endpoint**: `GET /devices/{deviceId}`

**Description**: Retrieve device information and DID

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deviceId": "TURBINE-1",
    "deviceName": "Main Hydropower Turbine",
    "deviceLocation": "Himachal Pradesh, India",
    "did": "did:hedera:testnet:0.0.7462776",
    "topicId": "0.0.7462776",
    "publicKey": "302a300506032b6570032100...",
    "registrationDate": "2026-01-15T10:00:00Z",
    "status": "active",
    "lastTelemetrySubmission": "2026-01-15T15:30:00Z",
    "totalReadings": 91
  }
}
```

---

### 2. Telemetry Management

#### 2.1 Submit Telemetry Reading

**Endpoint**: `POST /telemetry/submit`

**Description**: Submit a single telemetry reading for verification

**Request Body**:
```json
{
  "deviceId": "TURBINE-1",
  "timestamp": "2026-01-15T10:00:00Z",
  "flowRate": 2.5,
  "head": 45.0,
  "capacityFactor": 0.65,
  "generatedKwh": 156.0,
  "pH": 7.2,
  "turbidity": 12.5,
  "temperature": 18.0
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "readingId": "READ-2026-001-001",
    "deviceId": "TURBINE-1",
    "timestamp": "2026-01-15T10:00:00Z",
    "verificationStatus": "PENDING",
    "trustScore": null,
    "transactionId": "0.0.6255927@1705317600.234567890"
  },
  "metadata": {
    "estimatedProcessingTime": "5-10 seconds",
    "hashscanUrl": "https://hashscan.io/testnet/transaction/0.0.6255927@1705317600.234567890"
  }
}
```

---

#### 2.2 Batch Submit Telemetry

**Endpoint**: `POST /telemetry/batch`

**Description**: Submit multiple telemetry readings at once

**Request Body**:
```json
{
  "readings": [
    {
      "deviceId": "TURBINE-1",
      "timestamp": "2026-01-15T10:00:00Z",
      "flowRate": 2.5,
      "head": 45.0,
      "capacityFactor": 0.65,
      "generatedKwh": 156.0,
      "pH": 7.2,
      "turbidity": 12.5,
      "temperature": 18.0
    },
    {
      "deviceId": "TURBINE-1",
      "timestamp": "2026-01-15T11:00:00Z",
      "flowRate": 2.6,
      "head": 45.0,
      "capacityFactor": 0.65,
      "generatedKwh": 162.0,
      "pH": 7.2,
      "turbidity": 12.5,
      "temperature": 18.0
    }
  ]
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "batchId": "BATCH-2026-001",
    "totalReadings": 2,
    "submittedReadings": 2,
    "failedReadings": 0,
    "readings": [
      {
        "readingId": "READ-2026-001-001",
        "status": "PENDING"
      },
      {
        "readingId": "READ-2026-001-002",
        "status": "PENDING"
      }
    ]
  }
}
```

---

#### 2.3 Get Telemetry Reading Status

**Endpoint**: `GET /telemetry/{readingId}`

**Description**: Check verification status of a telemetry reading

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "readingId": "READ-2026-001-001",
    "deviceId": "TURBINE-1",
    "timestamp": "2026-01-15T10:00:00Z",
    "verificationStatus": "APPROVED",
    "trustScore": 0.95,
    "checks": {
      "physics": { "isValid": true },
      "temporal": { "isValid": true },
      "environmental": { "isValid": true },
      "statistical": { "isValid": true, "zScore": 1.2 }
    },
    "calculations": {
      "generatedKwh": 156.0,
      "emissionReductions": 124.8,
      "recsIssued": 124.8
    }
  }
}
```

---

### 3. Verification & Attestation

#### 3.1 Get Verification Decision

**Endpoint**: `GET /verification/{readingId}`

**Description**: Get AI verification decision for a reading

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "readingId": "READ-2026-001-001",
    "verificationStatus": "APPROVED",
    "trustScore": 0.95,
    "autoApproved": true,
    "verificationMethod": "AI-Guardian-V1",
    "attestation": {
      "signature": "3045022100...",
      "verifierPublicKey": "302a300506032b6570032100...",
      "signingTimestamp": "2026-01-15T10:00:05Z"
    },
    "reasoning": {
      "physicsCheck": "PASS - All constraints satisfied",
      "temporalCheck": "PASS - Consistent with previous reading",
      "environmentalCheck": "PASS - All parameters within bounds",
      "statisticalCheck": "PASS - Z-score 1.2 < threshold 3.0"
    }
  }
}
```

---

#### 3.2 Get Attestation

**Endpoint**: `GET /attestation/{readingId}`

**Description**: Retrieve cryptographic attestation for a reading

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "attestationId": "ATT-2026-001-001",
    "readingId": "READ-2026-001-001",
    "verificationStatus": "APPROVED",
    "trustScore": 0.95,
    "signature": "3045022100...",
    "verifierPublicKey": "302a300506032b6570032100...",
    "signingTimestamp": "2026-01-15T10:00:05Z",
    "acm0002Calculations": {
      "BE_tCO2": 124.8,
      "PE_tCO2": 0,
      "LE_tCO2": 0,
      "ER_tCO2": 124.8,
      "RECs_issued": 124.8
    },
    "onChainReference": {
      "topicId": "0.0.7462600",
      "messageSequence": 42,
      "transactionId": "0.0.6255927@1705317605.345678901"
    }
  }
}
```

---

### 4. REC Management

#### 4.1 Create REC Token

**Endpoint**: `POST /recs/create-token`

**Description**: Create a new REC token on Hedera HTS

**Request Body**:
```json
{
  "tokenName": "Hydropower REC",
  "tokenSymbol": "H-REC",
  "decimals": 2,
  "supplyType": "INFINITE"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "tokenId": "0.0.7462931",
    "tokenName": "Hydropower REC",
    "tokenSymbol": "H-REC",
    "decimals": 2,
    "supplyType": "INFINITE",
    "treasuryAccount": "0.0.6255927",
    "creationDate": "2026-01-15T10:00:00Z"
  },
  "metadata": {
    "transactionId": "0.0.6255927@1705317600.456789012",
    "hashscanUrl": "https://hashscan.io/testnet/token/0.0.7462931"
  }
}
```

---

#### 4.2 Mint RECs

**Endpoint**: `POST /recs/mint`

**Description**: Mint new RECs based on verified readings

**Request Body**:
```json
{
  "tokenId": "0.0.7462931",
  "amount": 13440,
  "recipientAccount": "0.0.1234567",
  "readingIds": ["READ-2026-001-001", "READ-2026-001-002"]
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "mintId": "MINT-2026-001",
    "tokenId": "0.0.7462931",
    "amount": 13440,
    "recipientAccount": "0.0.1234567",
    "readingCount": 2,
    "mintDate": "2026-01-15T10:00:00Z",
    "status": "CONFIRMED"
  },
  "metadata": {
    "transactionId": "0.0.6255927@1705317600.567890123",
    "hashscanUrl": "https://hashscan.io/testnet/transaction/0.0.6255927@1705317600.567890123"
  }
}
```

---

#### 4.3 Transfer RECs

**Endpoint**: `POST /recs/transfer`

**Description**: Transfer RECs between accounts

**Request Body**:
```json
{
  "tokenId": "0.0.7462931",
  "fromAccount": "0.0.1234567",
  "toAccount": "0.0.9876543",
  "amount": 100
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "transferId": "XFER-2026-001",
    "tokenId": "0.0.7462931",
    "fromAccount": "0.0.1234567",
    "toAccount": "0.0.9876543",
    "amount": 100,
    "transferDate": "2026-01-15T10:00:00Z",
    "status": "CONFIRMED"
  }
}
```

---

### 5. Reporting

#### 5.1 Generate Monitoring Report

**Endpoint**: `POST /reports/monitoring`

**Description**: Generate monitoring report for a period

**Request Body**:
```json
{
  "deviceId": "TURBINE-1",
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "reportFormat": "json"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "reportId": "REPORT-2026-001",
    "deviceId": "TURBINE-1",
    "period": "2026-01-01 to 2026-01-31",
    "totalReadings": 744,
    "approvedReadings": 720,
    "rejectedReadings": 24,
    "totalGeneration": 16800,
    "totalEmissionReductions": 13440,
    "totalRECs": 13440,
    "averageTrustScore": 0.92,
    "generationTrend": "stable",
    "reportDate": "2026-02-01T00:00:00Z"
  }
}
```

---

#### 5.2 Get Aggregated Metrics

**Endpoint**: `GET /reports/metrics/{deviceId}`

**Description**: Get aggregated metrics for a device

**Query Parameters**:
- `period`: daily, weekly, monthly, yearly
- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deviceId": "TURBINE-1",
    "period": "monthly",
    "metrics": {
      "totalGeneration": 16800,
      "totalEmissionReductions": 13440,
      "totalRECs": 13440,
      "averageEfficiency": 0.87,
      "uptime": 0.97,
      "readingCount": 744,
      "approvalRate": 0.968
    },
    "trend": {
      "generationTrend": "stable",
      "efficiencyTrend": "improving",
      "approvalRateTrend": "stable"
    }
  }
}
```

---

## Data Models

### Telemetry Reading

```json
{
  "deviceId": "string (required)",
  "timestamp": "ISO 8601 (required)",
  "flowRate": "number (0.1-100 m³/s)",
  "head": "number (10-500 m)",
  "capacityFactor": "number (0-1)",
  "generatedKwh": "number (>0)",
  "pH": "number (6.5-8.5)",
  "turbidity": "number (0-100 NTU)",
  "temperature": "number (0-40°C)"
}
```

### Verification Result

```json
{
  "readingId": "string",
  "verificationStatus": "APPROVED | REJECTED | FLAGGED",
  "trustScore": "number (0-1)",
  "checks": {
    "physics": { "isValid": "boolean" },
    "temporal": { "isValid": "boolean" },
    "environmental": { "isValid": "boolean" },
    "statistical": { "isValid": "boolean", "zScore": "number" }
  },
  "calculations": {
    "generatedKwh": "number",
    "emissionReductions": "number",
    "recsIssued": "number"
  }
}
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "fieldName",
      "issue": "Specific issue description"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input parameters |
| `PHYSICS_CONSTRAINT_ERROR` | 400 | Physics constraint violation |
| `TEMPORAL_CONSISTENCY_ERROR` | 400 | Temporal inconsistency detected |
| `ENVIRONMENTAL_BOUNDS_ERROR` | 400 | Environmental parameter out of bounds |
| `ANOMALY_DETECTION_ERROR` | 400 | Anomaly detected in data |
| `AUTHENTICATION_ERROR` | 401 | Invalid authentication credentials |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND_ERROR` | 404 | Resource not found |
| `HEDERA_ERROR` | 500 | Hedera transaction failed |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limiting

- **Requests per minute**: 60
- **Requests per hour**: 3,600
- **Batch size limit**: 1,000 readings per batch
- **Retry-After header**: Included in 429 responses

---

## Examples

### Complete Workflow Example

```bash
# 1. Deploy Device DID
curl -X POST https://testnet-api.hedera-hydropower.local/v1/devices/deploy-did \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "TURBINE-1",
    "deviceName": "Main Hydropower Turbine",
    "deviceLocation": "Himachal Pradesh, India",
    "deviceType": "pelton",
    "capacityKw": 100
  }'

# 2. Create REC Token
curl -X POST https://testnet-api.hedera-hydropower.local/v1/recs/create-token \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenName": "Hydropower REC",
    "tokenSymbol": "H-REC",
    "decimals": 2
  }'

# 3. Submit Telemetry
curl -X POST https://testnet-api.hedera-hydropower.local/v1/telemetry/submit \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "TURBINE-1",
    "timestamp": "2026-01-15T10:00:00Z",
    "flowRate": 2.5,
    "head": 45.0,
    "capacityFactor": 0.65,
    "generatedKwh": 156.0,
    "pH": 7.2,
    "turbidity": 12.5,
    "temperature": 18.0
  }'

# 4. Check Verification Status
curl -X GET https://testnet-api.hedera-hydropower.local/v1/telemetry/READ-2026-001-001 \
  -H "Authorization: Bearer $JWT_TOKEN"

# 5. Mint RECs
curl -X POST https://testnet-api.hedera-hydropower.local/v1/recs/mint \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "0.0.7462931",
    "amount": 13440,
    "recipientAccount": "0.0.1234567",
    "readingIds": ["READ-2026-001-001"]
  }'
```

---

## Support

For API support, contact: api-support@hedera-hydropower.local

Last Updated: 2026-02-15
API Version: 1.0.0
