> **⚠️ HISTORICAL REFERENCE ONLY**  
> This document contains legacy verification weights (30/30/20/20) that differ from the current production implementation.  
> **Canonical source**: [METHODOLOGY.md](./METHODOLOGY.md) defines authoritative weights (30/25/20/15/10)  
> **Status**: Reference documentation for historical context  
> **Last valid**: February 14, 2026

---

# ENGINE V1 – Verra-Aligned MRV Engine Specification

**Document**: ENGINE V1 Technical Specification  
**Project**: Hedera Hydropower Digital MRV Tool  
**Version**: 2.0 (Enhanced)  
**Date**: February 14, 2026  
**Status**: Production-Ready Phase 1  

---

## Executive Summary

ENGINE V1 is the **fixed, Verra-aligned MRV engine** that implements ACM0002 calculations and verification logic. The engine is **methodology-neutral**—it does not change ACM0002 formulas or requirements. All configurable execution knobs (scope, anchoring, batching, AI verification) change only **how** and **where** data is anchored and reviewed, not the MRV logic itself.

**Key Principle**: ENGINE V1 is immutable. Configuration changes affect execution layer only, never the core engine.

---

## Part 1: Core Architecture

### 1.1 Four-Layer Design

```
┌─────────────────────────────────────────────┐
│ Layer 1: Data Collection                    │
│ - IoT sensors (flow, head, pH, turbidity)   │
│ - Device DIDs (cryptographic identity)      │
│ - Signed telemetry payloads                 │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 2: ENGINE V1 Verification             │
│ - Physics constraints (ρgQH formula)        │
│ - Temporal consistency checks               │
│ - Environmental bounds checks               │
│ - Statistical anomaly detection (3-sigma)   │
│ - Result: isValid, rejectionReasons         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 3: AI-Assisted Verification           │
│ - Trust scoring (0-1 scale)                 │
│ - Auto-approval (threshold-based)           │
│ - Flagging for manual review                │
│ - Cryptographic attestation                 │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Layer 4: Execution & Anchoring              │
│ - Direct vs. Merkle aggregation             │
│ - Batch processing (hourly/daily/monthly)   │
│ - HCS topic publishing                      │
│ - REC minting via HTS                       │
└─────────────────────────────────────────────┘
```

### 1.2 Immutability Guarantee

**What Cannot Change**:
- ACM0002 formulas (BE = EG × EF)
- Physics constraints (ρgQH validation)
- Temporal consistency rules
- Environmental bounds
- Statistical anomaly detection (3-sigma)

**What Can Change** (Configuration Only):
- Anchoring mode (direct vs. Merkle)
- Batch frequency (hourly, daily, monthly)
- AI trust threshold (0.70-0.95)
- Scope (device vs. project vs. both)
- Verifier type (human vs. AI-assisted)

---

[Rest of ENGINE-V1.md content remains the same...]

**Note**: For current production implementation weights and thresholds, see [METHODOLOGY.md](./METHODOLOGY.md).