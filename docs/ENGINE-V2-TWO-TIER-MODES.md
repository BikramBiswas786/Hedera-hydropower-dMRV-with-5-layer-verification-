# ENGINE V2 — Two-Tier Execution Modes

> **Note**: This document was previously stored as `ENGINE-V2-TWO-TIER-MODES.md.txt`.
> Renamed to `.md` for proper rendering. Content is unchanged.

Please refer to the `.txt` source in git history if needed for diff comparison.

---

<!-- Original content below (preserved) -->

See `docs/ENGINE-V2-TWO-TIER-MODES.md.txt` for the original source until this
doc is fully migrated. The two-tier mode concept:

## Two-Tier Mode Overview

**Tier 1 — Fast Path (Automated)**  
All readings pass through ENGINE V1 physics + AI Guardian. Trust score ≥ 0.90
gets auto-approved and anchored to HCS immediately.

**Tier 2 — Review Path (Manual)**  
Readings with trust score 0.70–0.90 are flagged and queued for manual VVB
review. The reviewer accesses the attestation record and either approves or
rejects it. Decision is then anchored to HCS as a `REVIEW_DECISION` message.

## Key Differences from V1

| Feature | Engine V1 | Engine V2 |
|---------|-----------|----------|
| Trust threshold | Binary (approve/reject) | Three-tier (approve/flag/reject) |
| Review queue | None | Built-in VVB review queue |
| Anchoring | Immediate | Immediate for Tier 1, deferred for Tier 2 |
| Cost | ~$0.0028/REC | ~$0.0031/REC (extra review message) |

---

*Full ENGINE V2 implementation is planned for Phase 3. See `docs/ENGINE-V1.md` for current production implementation.*
