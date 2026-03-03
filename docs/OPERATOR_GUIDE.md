# Operator Guide

**Last reviewed**: March 4, 2026

This guide is for personnel responsible for the day-to-day operation of a deployed MRV installation.

---

## Prerequisites

Before operating the system, ensure you have:

- [ ] A personal API key (not the demo key). See [SECURITY.md §API Keys](./SECURITY.md#api-keys).
- [ ] Network access to the API endpoint.
- [ ] Redis running and confirmed healthy (`redis-cli ping` → `PONG`).
- [ ] Hedera account funded with HBAR for transactions.

---

## Daily Operations

### Checking System Health

```bash
# Check API and dependencies
curl https://your-deployment.vercel.app/api/status
```

The response should show `"status": "ok"` with `hedera.connected: true` and `redis.connected: true`.

If Redis shows `connected: false`:
```bash
# Restart Redis
docker restart redis
# or via WSL
wsl sudo service redis-server restart
```

If Hedera shows `connected: false`, check HBAR balance and network status at [status.hedera.com](https://status.hedera.com).

### Reviewing Today's Readings

All readings are recorded on the Hedera Consensus Service and viewable at:
```
https://hashscan.io/testnet/topic/0.0.7462776
```

For programmatic access:
```bash
# Retrieve last 20 messages from HCS topic
npm run query:hcs -- --limit 20
```

---

## Responding to FLAGGED Readings

A FLAGGED reading means the system detected anomalies but trust score was 0.50–0.90. The reading is recorded on HCS but no RECs are minted.

**Steps**:
1. Note the `flags` array in the API response.
2. Check the plant's physical sensors for the flagged parameter.
3. If the flag is a false positive (sensor calibration drift, unusual but legitimate operating conditions), document it in the plant log.
4. If the flag indicates a real anomaly (sensor malfunction, unexpected conditions), investigate and repair before resuming normal operation.
5. Once resolved, resubmit the corrected reading. Note: you cannot resubmit a reading with an identical timestamp (replay protection will block it). Use a new timestamp.

| Flag | Likely cause | Action |
|---|---|---|
| `PHYSICS_VIOLATION` | Sensor malfunction or calibration error | Recalibrate flow/head/power sensors |
| `TEMPORAL_ANOMALY` | Clock drift on edge device; connectivity outage causing batch submission | Sync device clock; investigate connectivity |
| `ENVIRONMENTAL_ANOMALY` | Real water quality event; probe fouling | Check probe; check upstream conditions |
| `STATISTICAL_ANOMALY` | Unusual but legitimate operating condition; sensor noise | Investigate; document if legitimate |
| `DEVICE_INCONSISTENCY` | Sensor degradation over time | Inspect sensors |

---

## Responding to REJECTED Readings

A REJECTED reading (trust score < 0.50) is a serious anomaly. The reading is recorded on HCS for audit purposes but no RECs are minted.

**Do not simply resubmit rejected readings without investigation.** A pattern of rejected readings may indicate sensor malfunction, attempted fraud, or a configuration error.

**Steps**:
1. Review the full `verification_details` from the API response.
2. Inspect the physical sensor array at the plant.
3. Compare the reported values against any available independent measurements.
4. Document findings.
5. If the issue is resolved (sensor replaced or calibrated), resubmit with corrected data and a new timestamp.

---

## Monitoring and Alerts

The `/metrics` endpoint exposes Prometheus-compatible metrics. Key metrics to monitor:

| Metric | Alert threshold |
|---|---|
| `mrv_readings_total{status="REJECTED"}` | > 5% of total readings |
| `mrv_hedera_tx_duration_seconds` | p95 > 10 seconds |
| `mrv_redis_errors_total` | Any increase |

For Grafana setup, see [MONITORING-PLAN.md](./MONITORING-PLAN.md).

---

## Credentials and Key Rotation

Rotate your API key immediately if:
- A team member with access to the key leaves the organisation
- You suspect the key may have been exposed
- It has been more than 90 days since the last rotation

To rotate:
1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update the key in your deployment environment.
3. Update the key on all edge devices that use it.
4. Verify connectivity from all devices with the new key.
5. Revoke the old key from the deployment environment.

**Never share your API key with another operator or plant.** Each operator and each plant integration should have its own key.
