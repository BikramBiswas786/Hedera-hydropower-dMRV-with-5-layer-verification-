# Hedera Hydropower MRV - API Documentation

## Overview
This document provides complete API documentation for the Hedera Hydropower MRV system. All endpoints are designed for integration with Hedera Testnet and follow RESTful principles.

## Endpoints

### 1. Device Management
#### 1.1 Deploy Device DID
**Endpoint**: `POST /devices/deploy-did`
**Description**: Deploy a new device identity to Hedera.

### 2. Telemetry Management
#### 2.1 Submit Telemetry Reading
**Endpoint**: `POST /telemetry/submit`
**Description**: Submit a single telemetry reading for verification.

#### 2.2 Batch Submit Telemetry
**Endpoint**: `POST /telemetry/batch`
**Description**: Submit multiple telemetry readings at once.

### 3. REC Management
#### 3.1 Create REC Token
**Endpoint**: `POST /recs/create-token`
**Description**: Create a new REC token on Hedera HTS.

#### 3.2 Mint RECs
**Endpoint**: `POST /recs/mint`
**Description**: Mint new RECs based on verified generation.

## Data Models
### Telemetry Reading
```json
{
  "deviceId": "string",
  "timestamp": "ISO 8601",
  "flowRate": "number",
  "head": "number",
  "capacityFactor": "number",
  "generatedKwh": "number"
}
```

## Examples
### Submit Telemetry
```bash
curl -X POST https://testnet-api.hedera-hydropower.local/v1/telemetry/submit \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "TURBINE-1",
    "timestamp": "2026-01-15T10:00:00Z",
    "generatedKwh": 156.0
  }'
```
