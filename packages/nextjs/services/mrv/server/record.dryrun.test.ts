import { DEMO_PLANT } from "../demo";
import type { RecordRequest } from "../schema";
import { recordReadings } from "./monitoring";
import { readFileSync } from "fs";
import { join } from "path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publishMessage = vi.fn();
const simulateContract = vi.fn();
const readContract = vi.fn();
const getGasPrice = vi.fn();
const writeContract = vi.fn();

const REGISTRY = "0x00000000000000000000000000000000000000aa" as const;
const MODULE = "0x00000000000000000000000000000000000000cc" as const;
const TOPIC = 10_729_650n;
const relayerKey = generatePrivateKey();
const relayer = privateKeyToAccount(relayerKey).address;
let operator: `0x${string}` = relayer as `0x${string}`;

vi.mock("./hcs", () => ({
  publishMessage: (...args: unknown[]) => publishMessage(...args),
}));

vi.mock("../network", async importOriginal => ({
  ...(await importOriginal<typeof import("../network")>()),
  getModuleDeployment: () => ({ address: MODULE, abi: [] }),
}));

vi.mock("viem", async importOriginal => ({
  ...(await importOriginal<typeof import("viem")>()),
  createWalletClient: () => ({ writeContract: (...args: unknown[]) => writeContract(...args) }),
}));

vi.mock("./registry", () => ({
  getProject: vi.fn(async () => ({
    plantId: DEMO_PLANT.plantId,
    design: DEMO_PLANT.design,
    operator,
    reporter: null,
    module: MODULE,
    meter: "0x0000000000000000000000000000000000000001",
    params: "0x",
    state: `0x${"00".repeat(32)}`,
    ledger: { attestations: 3, balanceG: 0, creditingYear: 0, yearNetWh: 0 },
  })),
  requireDeployment: () => ({
    address: REGISTRY,
    abi: [],
    errorAbi: [],
    client: { simulateContract, readContract, getGasPrice, waitForTransactionReceipt: vi.fn() },
  }),
  hydroChain: () => ({ id: 296 }),
  hydroTransport: () => ({}),
}));

const statement = {
  periodStart: 1_700_000_000,
  periodEnd: 1_700_086_400,
  grossWh: 1_000,
  netWh: 900,
  fuelG: 0,
  readingsDigest: `0x${"11".repeat(32)}` as Hex,
  intervals: 96,
  intervalSeconds: 900,
};

vi.mock("../pipeline", () => ({
  prepareAnchors: () => ({
    report: {
      decision: "APPROVED",
      emissions: { reductionG: 1000, unitsMinted: 1 },
      periodStart: 1_700_000_000,
      periodEnd: 1_700_086_400,
      monitored: { netWh: 850, grossWh: 1_000, fuelG: 0, leakageG: 0 },
      completenessBps: 10_000,
      provenance: { status: "signed" },
      meterStatement: statement,
    },
    data: { dataHash: `0x${"22".repeat(32)}`, chunks: 1, message: "data" },
    preview: { message: "report", reportHash: `0x${"33".repeat(32)}` },
  }),
}));

vi.mock("../report", () => ({
  buildHcsMessage: (_report: unknown, data: { sequence: number }) => ({
    message: `report->${data.sequence}`,
    reportHash: `0x${"44".repeat(32)}`,
  }),
}));

const base = {
  plant: DEMO_PLANT,
  readings: [],
  signature: `0x${"11".repeat(65)}`,
  metering: { deviceAddress: "0x0000000000000000000000000000000000000001" },
} as unknown as RecordRequest;

function mockReads(quantified = 1000n) {
  readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "quantify") return { reductionG: quantified };
    if (functionName === "auditTopic") return TOPIC;
    throw new Error(`unexpected read ${functionName}`);
  });
}

beforeEach(() => {
  for (const mock of [publishMessage, simulateContract, readContract, getGasPrice, writeContract]) mock.mockReset();
  mockReads();
  operator = relayer as `0x${string}`;
  process.env.HEDERA_OPERATOR_ID = "0.0.1001";
  process.env.HEDERA_OPERATOR_KEY = relayerKey.slice(2);
  delete process.env.RELAYER_PRIVATE_KEY;
  process.env.HCS_TOPIC_ID = `0.0.${TOPIC}`;
});

describe("recording a monitoring period: nothing reaches HCS that the registry would refuse", () => {
  it("dry-runs recordMonitoring and checks the module before any HCS publish", () => {
    const source = readFileSync(join(__dirname, "monitoring.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function recordReadings"));
    const firstPublish = body.indexOf("publishMessage(");
    expect(body.indexOf('functionName: "quantify"')).toBeGreaterThan(0);
    expect(body.indexOf('functionName: "quantify"')).toBeLessThan(firstPublish);
    expect(body.indexOf("await simulate(")).toBeLessThan(firstPublish);
    expect(body.indexOf("requireRecorder(")).toBeLessThan(firstPublish);
  });

  it("refuses before publishing when the server key is neither operator nor reporter", async () => {
    operator = "0x00000000000000000000000000000000000000ee";
    await expect(recordReadings(base)).rejects.toMatchObject({ httpStatus: 503, message: /setReporter/ });
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("publishes nothing when the module's quantify disagrees with the engine", async () => {
    mockReads(0n);
    await expect(recordReadings(base)).rejects.toThrow(/nothing was published/);
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("publishes nothing when the dry run fails", async () => {
    simulateContract.mockRejectedValue(new Error("CalibrationExpired(1700086400, 1690000000)"));
    await expect(recordReadings(base)).rejects.toThrow(/would reject this record/);
    expect(publishMessage).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("publishes data, then the report citing it, then records with the report's HCS sequence", async () => {
    publishMessage
      .mockResolvedValueOnce({ topicId: `0.0.${TOPIC}`, topicNum: TOPIC, sequenceNumber: 41n, transactionId: "t1" })
      .mockResolvedValueOnce({ topicId: `0.0.${TOPIC}`, topicNum: TOPIC, sequenceNumber: 42n, transactionId: "t2" });
    writeContract.mockRejectedValue(new Error("stop after the call is built"));
    await expect(recordReadings(base)).rejects.toThrow(/stop after/);
    expect(publishMessage.mock.calls.map(call => call[1])).toEqual(["data", "report->41"]);
    const [{ functionName, args }] = writeContract.mock.calls[0];
    expect(functionName).toBe("recordMonitoring");
    expect(args[0]).toMatchObject({
      sequence: 3,
      hcsTopicNum: TOPIC,
      hcsSequence: 42n,
      reportHash: `0x${"44".repeat(32)}`,
    });
  });
});
