# Complete Demo & Submission Guide
## Hedera Hello Future Apex 2026 — Sustainability Track

> **This guide covers every remaining action to complete your submission.**

---

## PART A — Vercel Deployment

| Variable | Value |
|----------|-------|
| `HEDERA_OPERATOR_ID` | `0.0.6255927` |
| `HEDERA_OPERATOR_KEY` | *(your testnet private key)* |
| `AUDIT_TOPIC_ID` | `0.0.7964262` |
| `REC_TOKEN_ID` | `0.0.7964264` |

Deploy at: https://vercel.com/new

Test URLs after deploy:
```
https://YOUR-VERCEL-URL.vercel.app/           → HTML dashboard
https://YOUR-VERCEL-URL.vercel.app/api/demo   → JSON pipeline output
https://YOUR-VERCEL-URL.vercel.app/api/status → JSON system status
```

---

## PART B — GitHub Actions Secrets

Go to: https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv/settings/secrets/actions

Add secrets:
| Secret | Value |
|--------|-------|
| `HEDERA_OPERATOR_ID` | `0.0.6255927` |
| `HEDERA_OPERATOR_KEY` | *(your testnet private key)* |
| `AUDIT_TOPIC_ID` | `0.0.7964262` |
| `REC_TOKEN_ID` | `0.0.7964264` |
| `EF_GRID` | `0.8` |

---

## PART C — Demo Video Script

### Run live demo:
```powershell
npm run demo
```

### Key talking points:
- Device DID registration on Hedera HCS
- HREC token creation on Hedera HTS
- Physics-based AI Guardian verification (ACM0002: P = ρ·g·Q·H·η)
- Fraud detection and rejection anchored to HCS
- HREC minting only for approved readings

### HashScan links to show:
- [Approved TX](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439)
- [Fraud TX](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316)
- [HREC Token](https://hashscan.io/testnet/token/0.0.7964264)
- [HCS Audit Topic](https://hashscan.io/testnet/topic/0.0.7964262)

---

## PART D — StackUp Submission

Submit at: https://hackathon.stackup.dev/web/events/hedera-hello-future-apex-hackathon-2026

| Field | Value |
|-------|-------|
| Project name | `Hedera Hydropower MRV` |
| Track | `Sustainability` |
| GitHub repo | `https://github.com/BikramBiswas786/https-github.com-BikramBiswas786-hedera-hydropower-mrv` |
| Deadline | 23 March 2026, 11:59 PM ET |

---

## Completion Tracker

| Task | Status |
|------|--------|
| `scripts/demo.js` | ✅ Done |
| `api/index.js` Vercel endpoint | ✅ Done |
| `vercel.json` deployment config | ✅ Done |
| CI workflow | ✅ Exists |
| GitHub Actions secrets | ⬜ You: 5 min |
| Vercel deployment | ⬜ You: browser |
| Demo video + YouTube | ⬜ You: 30 min |
| StackUp submission | ⬜ Before Mar 23 |
