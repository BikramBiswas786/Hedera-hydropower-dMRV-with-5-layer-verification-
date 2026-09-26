import { DEMO_PLANT } from "../demo";
import type { VerifyRequest } from "../schema";
import { attestReadings } from "./attest";
import { readFileSync } from "fs";
import { join } from "path";
import { generatePrivateKey } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publishMessage = vi.fn();
const simulateContract = vi.fn();
const readContract = vi.fn();
const getGasPrice = vi.fn();

vi.mock("./hcs", () => ({
  publishMessage: (...args: unknown[]) => publishMessage(...args),
}));

vi.mock("./registry", () => ({
  getPlant: vi.fn(async () => ({
    design: DEMO_PLANT.design,
    meter: "0x0000000000000000000000000000000000000001",
    ledger: { attestations: 0 },
  })),
  requireDeployment: () => ({
    address: "0x00000000000000000000000000000000000000aa",
    abi: [],
    client: { simulateContract, readContract, getGasPrice, chain: { id: 296 } },
  }),
  hydroChain: () => ({ id: 296 }),
  hydroTransport: () => ({}),
}));

vi.mock("../pipeline", () => ({
  prepareAnchors: () => ({
    report: {
      decision: "APPROVED",
      emissions: { reductionG: 1000, unitsMinted: 1 },
      periodStart: 1_700_000_000,
      periodEnd: 1_700_086_400,
      monitored: { netWh: 1, grossWh: 1, fuelG: 0, leakageG: 0 },
      completenessBps: 10_000,
      provenance: { status: "signed" },
      meterStatement: {
        grossWh: 1,
        netWh: 1,
        fuelG: 0,
        readingsDigest: `0x${"11".repeat(32)}`,
      },
    },
    data: { dataHash: `0x${"22".repeat(32)}`, chunks: 1, message: "data" },
    preview: { message: "report", reportHash: `0x${"33".repeat(32)}` },
  }),
}));

const request = {
  plant: DEMO_PLANT,
  readings: [],
  signature: "0x11",
  metering: { deviceAddress: "0x0000000000000000000000000000000000000001" },
} as unknown as VerifyRequest;

beforeEach(() => {
  publishMessage.mockReset();
  simulateContract.mockReset();
  readContract.mockReset();
  getGasPrice.mockReset();
  const key = generatePrivateKey().slice(2);
  process.env.HEDERA_OPERATOR_ID = "0.0.1001";
  process.env.HEDERA_OPERATOR_KEY = key;
  process.env.VERIFIER_PRIVATE_KEY = key;
  process.env.HCS_TOPIC_ID = "0.0.10726081";
});

describe("attestation dry-run", () => {
  it("simulates submitAttestation before any HCS publish", () => {
    const source = readFileSync(join(__dirname, "attest.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function attestReadings"));
    expect(body.indexOf("simulateContract")).toBeGreaterThan(0);
    expect(body.indexOf("simulateContract")).toBeLessThan(body.indexOf("publishMessage"));
    expect(body.indexOf("nothing was published")).toBeLessThan(body.indexOf("publishMessage"));
  });

  it("publishes nothing when the dry-run revert fires", async () => {
    simulateContract.mockRejectedValue(new Error("PeriodOutsideCreditingPeriod"));
    await expect(attestReadings(request)).rejects.toThrow(/would reject this attestation/);
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("publishes nothing when the contract quantify disagrees", async () => {
    simulateContract.mockResolvedValue({});
    readContract.mockResolvedValue({ reductionG: 0n, units: 0n });
    await expect(attestReadings(request)).rejects.toThrow(/nothing was published/);
    expect(publishMessage).not.toHaveBeenCalled();
    expect(getGasPrice).not.toHaveBeenCalled();
  });
});
