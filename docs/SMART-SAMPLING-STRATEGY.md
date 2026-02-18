# Smart Sampling Strategy — Statistical Methodology for VVB Confidence

**Version**: 2.0 (Layer 3)  
**Status**: Design Complete  
**Depends on**: `ENGINE-V2-TWO-TIER-MODES.md`

> This file is the canonical `.md` version, migrated from `SMART-SAMPLING-STRATEGY.md.txt`.

---

## Purpose

**Problem**: VVBs won’t accept “90% auto-approval” without statistical guarantees that
the sampled subset still catches anomalies with high confidence.

**Solution**: Formal stratified sampling methodology with:
- Confidence intervals (95%, 99%)
- Risk-stratified sampling (high / medium / low)
- Auditable sampling logs

**Cost impact**: Proves that ~5–10% human review can provide essentially the same
assurance as 100% review → unlocks Mode B economics.

---

## Risk Strata

| Stratum | Definition | Expected anomaly rate | Sample rate |
|---------|------------|-----------------------|-------------|
| **High-risk** | Trust 0.90–0.92, new device, recent anomaly | 3–5% | 30% |
| **Medium-risk** | Trust 0.92–0.95, mature device | 1–2% | 10% |
| **Low-risk** | Trust ≥0.95, mature device, no recent anomalies | 0.5–1% | 3% |

### Example: 1000 auto-approved readings

- High-risk: 50 readings × 30% = **15 samples**
- Medium-risk: 300 readings × 10% = **30 samples**
- Low-risk: 650 readings × 3% = **20 samples**
- **Total**: 65 samples = **6.5% effective sample rate**

Because of risk focus, this provides the anomaly-detection power of ~15–20%
simple random sampling.

---

## SmartSampler Implementation Concept

```javascript
class SmartSampler {
  constructor(config) {
    this.stratifiedEnabled = config.stratified ?? true;
    this.confidenceLevel    = config.confidenceLevel || 0.95;
  }

  selectSamples(decisions, context) {
    return this.stratifiedEnabled
      ? this.stratifiedSample(decisions, context)
      : this.simpleSample(decisions, context);
  }

  stratifiedSample(decisions, context) {
    const autoApproved = decisions.filter(d => d.decision === 'AUTO_APPROVED');
    const strata = {
      high:   autoApproved.filter(d => this.isHighRisk(d, context)),
      medium: autoApproved.filter(d => this.isMediumRisk(d, context)),
      low:    autoApproved.filter(d => this.isLowRisk(d, context))
    };
    const samples = {
      high:   this.sampleFromStratum(strata.high,   0.30, 'high-risk'),
      medium: this.sampleFromStratum(strata.medium, 0.10, 'medium-risk'),
      low:    this.sampleFromStratum(strata.low,    0.03, 'low-risk')
    };
    const totalSample = samples.high.length + samples.medium.length + samples.low.length;
    return {
      samples: [...samples.high, ...samples.medium, ...samples.low],
      strataSizes:  { high: strata.high.length,   medium: strata.medium.length,  low: strata.low.length },
      sampleSizes:  { high: samples.high.length,  medium: samples.medium.length, low: samples.low.length },
      effectiveRate: totalSample / autoApproved.length,
      confidenceLevel: this.confidenceLevel
    };
  }

  isHighRisk(d, context) {
    return (d.trustScore >= 0.90 && d.trustScore < 0.92)
      || context.device?.operationalDays < 180
      || context.recentAnomalies > 0;
  }

  isMediumRisk(d, context) {
    return d.trustScore >= 0.92 && d.trustScore < 0.95
      && context.device?.operationalDays >= 180;
  }

  isLowRisk(d, context) {
    return d.trustScore >= 0.95
      && context.device?.operationalDays >= 180
      && context.recentAnomalies === 0;
  }

  sampleFromStratum(stratum, rate, label) {
    const sampleSize = Math.ceil(stratum.length * rate);
    return [...stratum]
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize)
      .map(d => ({
        readingId: d.readingId,
        trustScore: d.trustScore,
        sampledForReview: true,
        samplingReason: `Stratified ${label} sample`,
        stratum: label
      }));
  }

  simpleSample(decisions, context) {
    const rate = context.samplingRate || 0.05;
    return decisions
      .filter(d => d.decision === 'AUTO_APPROVED')
      .filter(() => Math.random() < rate)
      .map(d => ({
        readingId: d.readingId,
        trustScore: d.trustScore,
        sampledForReview: true,
        samplingReason: 'Simple random sample'
      }));
  }

  calculateConfidenceInterval(sampledAnomalies, sampleSize) {
    const p = sampledAnomalies / sampleSize;
    const z = this.confidenceLevel === 0.99 ? 2.576 : 1.96;
    const se = Math.sqrt((p * (1 - p)) / sampleSize);
    return {
      estimate:         p,
      lowerBound:       Math.max(0, p - z * se),
      upperBound:       Math.min(1, p + z * se),
      confidenceLevel:  this.confidenceLevel
    };
  }
}

module.exports = SmartSampler;
```

---

## ACM0002 Compliance Note

ACM0002 requires monitoring of **all** energy generation, not a sample.
The Smart Sampler is used for **HCS anchoring cost reduction only** —
all readings are still processed by ENGINE V1 and stored in the attestation
store. The Merkle tree ensures every reading is individually provable on demand.

---

## Related Documents

- [`docs/ENGINE-V2-TWO-TIER-MODES.md`](./ENGINE-V2-TWO-TIER-MODES.md) — Mode A/B thresholds
- [`docs/ANCHORING-MODES.md`](./ANCHORING-MODES.md) — HCS anchoring modes and costs
- [`src/smart-sampler.js`](../src/smart-sampler.js) — Current implementation
