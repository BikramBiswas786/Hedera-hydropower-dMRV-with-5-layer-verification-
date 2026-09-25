/**
 * One meter statement and its hash, asserted by both suites: the contract test encodes it with ethers (and checks the
 * contract hashes live statements the same way), the vitest suite with `provenance.ts`. Change the encoding in one
 * place and this vector fails in the other.
 */
export const METER_STATEMENT_VECTOR = {
  domain: { chainId: 296, registry: "0x7Da5C616f478c4111cF9173102298b2B6D888993" },
  plantId: "HYDRO-DEMO-01",
  statement: {
    periodStart: 1_790_000_000,
    periodEnd: 1_790_086_400,
    grossWh: 8_805_123,
    netWh: -1_250,
    fuelG: 42_001,
    readingsDigest: "0x1111111111111111111111111111111111111111111111111111111111111111",
  },
  hash: "0xacd06032ad75a113bf511d452e4c6571ad83649fcf35e65e26229e80b4c1e7b3",
} as const;
