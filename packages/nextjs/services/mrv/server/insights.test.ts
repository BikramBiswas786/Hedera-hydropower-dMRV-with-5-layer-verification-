import type { AttestationView } from "../views";
import { type Portfolio, plantTotals, portfolioCsv, portfolioQuerySchema } from "./insights";
import { describe, expect, it } from "vitest";

const attestation = (overrides: Partial<AttestationView>): AttestationView => ({
  id: 0,
  plantId: "HYDRO-DEMO-01",
  periodStart: 0,
  periodEnd: 86_400,
  netEnergyWh: 8_000_000,
  grossEnergyWh: 8_100_000,
  fuelG: 0,
  projectEnergyWh: 8_000_000,
  baselineG: 4_900_000,
  reservoirG: 0,
  fossilFuelG: 0,
  leakageG: 0,
  reductionG: 4_900_000,
  unitsMinted: 4_900,
  completenessBps: 10_000,
  reportHash: `0x${"00".repeat(32)}`,
  hcsTopicId: "0.0.5005",
  hcsSequence: 4,
  verifier: "0x0000000000000000000000000000000000000001",
  timestamp: 86_460,
  ...overrides,
});

describe("plantTotals", () => {
  it("sums every figure and weights coverage by period length", () => {
    const totals = plantTotals([
      attestation({}),
      attestation({
        id: 1,
        periodStart: 86_400,
        periodEnd: 86_400 * 3,
        netEnergyWh: 2_000_000,
        fossilFuelG: 100_000,
        reductionG: 1_000_000,
        unitsMinted: 1_000,
        completenessBps: 9_100,
      }),
    ]);
    expect(totals).toMatchObject({
      attestations: 2,
      netWh: 10_000_000,
      fossilFuelG: 100_000,
      reductionG: 5_900_000,
      unitsMinted: 5_900,
      completenessBps: 9_400,
      firstPeriodStart: 0,
      lastPeriodEnd: 86_400 * 3,
    });
    expect(totals.creditsPerMwh).toBeCloseTo(0.59, 9);
  });

  it("reports nothing rather than zero for a plant without attestations", () => {
    expect(plantTotals([])).toMatchObject({ attestations: 0, completenessBps: null, creditsPerMwh: null });
  });
});

describe("portfolio", () => {
  const portfolio: Portfolio = {
    account: "0x620b69e63699Edf397146d1306e38fc9F289f981",
    beneficiary: null,
    totals: { retiredKg: 1_500, retirements: 2, certificates: 1, custodyKg: 0 },
    retirements: [
      {
        id: 1,
        account: "0x620b69e63699Edf397146d1306e38fc9F289f981",
        units: 1_250,
        timestamp: 1_790_000_000,
        beneficiary: 'Acme, "Scope 2" FY26',
        certificateSerial: 3,
        certificateDelivered: true,
        certificateUrl: "/certificate/1",
        nftUrl: null,
      },
      {
        id: 0,
        account: "0x620b69e63699Edf397146d1306e38fc9F289f981",
        units: 250,
        timestamp: 1_789_000_000,
        beneficiary: '=HYPERLINK("http://evil")',
        certificateSerial: 0,
        certificateDelivered: false,
        certificateUrl: "/certificate/0",
        nftUrl: null,
      },
    ],
  };

  it("exports RFC 4180 CSV in tonnes with absolute certificate links", () => {
    const [header, first] = portfolioCsv(portfolio, "https://hydro.example").split("\r\n");
    expect(header).toBe(
      "retirement_id,retired_at_utc,tonnes_co2e,beneficiary,account,certificate_serial,certificate_delivered,certificate_url",
    );
    expect(first).toBe(
      `1,2026-09-21T14:13:20.000Z,1.250,"Acme, ""Scope 2"" FY26",0x620b69e63699Edf397146d1306e38fc9F289f981,3,true,https://hydro.example/certificate/1`,
    );
  });

  it("neutralises spreadsheet formulas in beneficiary names written on-chain by anyone", () => {
    const row = portfolioCsv(portfolio, "https://hydro.example").split("\r\n")[2];
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it("needs an account or a beneficiary", () => {
    expect(portfolioQuerySchema.safeParse({}).success).toBe(false);
    expect(portfolioQuerySchema.safeParse({ account: "0x123" }).success).toBe(false);
    expect(portfolioQuerySchema.safeParse({ beneficiary: "Acme" }).success).toBe(true);
  });
});
