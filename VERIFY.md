# Independent Verification Guide

Anyone can verify this system independently in three ways.

---

## Option 1 — Run the Full Test Suite

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

You need your own Hedera testnet account and .env file. Get a free testnet account at [https://portal.hedera.com](https://portal.hedera.com/).

---

## Option 2 — Verify Live Transactions on HashScan

No account is needed. Open each link:

| Event                          | Link                                                                                                        |
|--------------------------------|-------------------------------------------------------------------------------------------------------------|
| Approved telemetry transaction | [https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439](https://hashscan.io/testnet/transaction/0.0.6255927@1771367521.991650439) |
| Rejected telemetry transaction | [https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316](https://hashscan.io/testnet/transaction/0.0.6255927@1771367525.903417316) |
| HREC token                     | [https://hashscan.io/testnet/token/0.0.7964264](https://hashscan.io/testnet/token/0.0.7964264)             |
| HCS audit topic                | [https://hashscan.io/testnet/topic/0.0.7964262](https://hashscan.io/testnet/topic/0.0.7964262)             |

---

## Option 3 — Read Raw Test Output

See evidence/raw-test-output.txt for the complete unedited Jest output captured at test time.