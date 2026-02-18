# Smart Sampling Strategy

> **Note**: This document was previously stored as `SMART-SAMPLING-STRATEGY.md.txt`.
> Renamed to `.md` for proper rendering. Content is unchanged from original.

---

<!-- Original content migrated below -->

See `docs/SMART-SAMPLING-STRATEGY.md.txt` for the original source until this
doc is fully migrated.

## Overview

The Smart Sampler (`src/smart-sampler.js`) implements adaptive sampling to
reduce Hedera transaction costs while maintaining data integrity.

## Sampling Modes

### 1. Full Sampling
Every reading is submitted. Used in `transparent-classic` mode.
- Cost: 100% of base cost
- Coverage: 100% of readings

### 2. Stratified Sampling
Readings are grouped into strata (by time of day, season, flow conditions).
One representative reading per stratum is anchored.
- Cost: ~20% of base cost
- Coverage: Statistically representative

### 3. Anomaly-Triggered Sampling
Only readings that deviate significantly from the expected profile are
anchored. Baseline readings are summarized in daily rollups.
- Cost: ~5–10% of base cost  
- Coverage: All anomalies + daily summary

### 4. Merkle Aggregation Sampling
All readings are included in a Merkle tree. Only the root is anchored.
Individual proofs available on demand.
- Cost: 1 HCS txn per batch (up to 10,000 readings)
- Coverage: 100% provable on demand

## ACM0002 Compliance Note

ACM0002 requires monitoring of **all** energy generation, not a sample.
The Smart Sampler is used for **HCS anchoring cost reduction only** —
all readings are still processed by ENGINE V1 and stored in the
attestation store. The Merkle tree ensures every reading is provable.

## Configuration

```js
const sampler = new SmartSampler({
  mode: 'merkle',        // full | stratified | anomaly | merkle
  batchSize: 100,        // readings per Merkle batch
  anomalyThreshold: 2.5  // z-score to trigger anomaly sampling
});
```

---

*See `src/smart-sampler.js` for implementation. See `docs/ANCHORING-MODES.md` for cost comparison.*
