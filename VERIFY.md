# Independent Verification Guide

Anyone can verify this system independently in three ways:

---

## Option 1 — Run the full test suite yourself

```bash
git clone https://github.com/BikramBiswas786/hedera-hydropower-mrv.git
cd hedera-hydropower-mrv
npm install && npm test
```

Expected output:

```text
Test Suites: 9 passed, 9 total
Tests:       224 passed, 224 total
Failures:    0
```

You need: your own Hedera testnet account and .env file.
Get a free testnet account: [https://portal.hedera.com](https://portal.hedera.com/)

---

## Option 2 — Verify live transactions on HashScan

No account needed. Click and verify:

| Event | Link |
|-------|------|
| Approved telemetry TX | [https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439) |
| Rejected telemetry TX | [https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316) |
| HREC Token | [https://hashscan.io/testnet/token/0.0.7964264](https://hashscan.io/testnet/token/0.0.7964264) |
| HCS Audit Topic | [https://hashscan.io/testnet/topic/0.0.7964262](https://hashscan.io/testnet/topic/0.0.7964262) |

---

## Option 3 — Read raw test output

See [evidence/raw-test-output.txt](evidence/raw-test-output.txt) for the complete unedited Jest run output captured at test time.