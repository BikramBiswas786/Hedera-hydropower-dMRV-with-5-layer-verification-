import { type ApprovalInput, signApproval } from "../approval";
import { DEMO_PLANT } from "../demo";
import type { AttestRequest } from "../schema";
import { attestReadings } from "./attest";
import { readFileSync } from "fs";
import { join } from "path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishMessage = vi.fn();
const simulateContract = vi.fn();
const readContract = vi.fn();
const getGasPrice = vi.fn();

const REGISTRY = "0x00000000000000000000000000000000000000aa" as const;
const TOPIC = 10_726_081n;
const REPORT_HASH = `0x${"33".repeat(32)}` as Hex;
const vvbKey = generatePrivateKey();
const vvb = privateKeyToAccount(vvbKey).address;

vi.mock("./hcs", () => ({
  publishMessage: (...args: unknown[]) => publishMessage(...args),
}));

vi.mock("./registry", () => ({
  getProject: vi.fn(async () => ({
    design: DEMO_PLANT.design,
    meter: "0x0000000000000000000000000000000000000001",
    ledger: { attestations: 0, balanceG: 0, creditingYear: 0, yearNetWh: 0 },
  })),
  requireDeployment: () => ({
    address: "0x00000000000000000000000000000000000000aa",
    abi: [],
    errorAbi: [],
    client: { simulateContract, readContract, getGasPrice, chain: { id: 296 } },
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
const monitored = { netWh: 850, grossWh: 1_000, fuelG: 0, leakageG: 0 };

vi.mock("../pipeline", () => ({
  prepareAnchors: () => ({
    report: {
      decision: "APPROVED",
      emissions: { reductionG: 1000, unitsMinted: 1 },
      periodStart: 1_700_000_000,
      periodEnd: 1_700_086_400,
      monitored,
      completenessBps: 10_000,
      provenance: { status: "signed" },
      meterStatement: statement,
    },
    data: { dataHash: `0x${"22".repeat(32)}`, chunks: 1, message: "data" },
    preview: { message: "report", reportHash: `0x${"33".repeat(32)}` },
  }),
}));

vi.mock("../report", () => ({
  buildHcsMessage: () => ({ message: "report", reportHash: `0x${"33".repeat(32)}` }),
}));

const base = {
  plant: DEMO_PLANT,
  readings: [],
  signature: `0x${"11".repeat(65)}`,
  metering: { deviceAddress: "0x0000000000000000000000000000000000000001" },
} as unknown as AttestRequest;

const anchor = { reportHash: REPORT_HASH, hcsTopicNum: TOPIC.toString(), hcsSequence: "42", dataSequence: 41 };
const approval = (verified = monitored): ApprovalInput => ({
  domain: { chainId: 296, registry: REGISTRY, sequence: 0 },
  plantId: DEMO_PLANT.plantId,
  statement,
  verified,
  reportHash: REPORT_HASH,
  hcsTopicNum: TOPIC,
  hcsSequence: 42n,
});

function mockReads(preview = 1000n) {
  readContract.mockImplementation(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
    if (functionName === "preview") return [{ reductionG: preview }, 1n];
    if (functionName === "VERIFIER_ROLE") return `0x${"ab".repeat(32)}`;
    if (functionName === "hasRole") return String(args?.[1]).toLowerCase() === vvb.toLowerCase();
    if (functionName === "evidenceUsed") return false;
    if (functionName === "auditTopic") return TOPIC;
    throw new Error(`unexpected read ${functionName}`);
  });
}

beforeEach(() => {
  publishMessage.mockReset();
  simulateContract.mockReset();
  readContract.mockReset();
  getGasPrice.mockReset();
  mockReads();
  const key = generatePrivateKey().slice(2);
  process.env.HEDERA_OPERATOR_ID = "0.0.1001";
  process.env.HEDERA_OPERATOR_KEY = key;
  process.env.VERIFIER_PRIVATE_KEY = key;
  process.env.HCS_TOPIC_ID = `0.0.${TOPIC}`;
});

afterEach(() => {
  delete process.env.DEMO_VVB_PRIVATE_KEY;
  delete process.env.DEMO_REGISTRY_ADDRESS;
});

describe("attestation: two signatures, nothing published without a VVB", () => {
  it("simulates submitAttestation before any HCS publish", () => {
    const source = readFileSync(join(__dirname, "attest.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function attestReadings"));
    expect(body.indexOf("simulateContract")).toBeGreaterThan(0);
    expect(body.indexOf("simulateContract")).toBeLessThan(body.indexOf("publishMessage"));
    expect(body.indexOf("Needs VVB approval")).toBeLessThan(body.indexOf("publishMessage"));
  });

  it("answers 409 'needs VVB approval' and publishes nothing without a VVB signature", async () => {
    await expect(attestReadings(base)).rejects.toMatchObject({ httpStatus: 409, message: /Needs VVB approval/ });
    expect(publishMessage).not.toHaveBeenCalled();
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("ignores the demo VVB key unless DEMO_REGISTRY_ADDRESS names this registry", async () => {
    process.env.DEMO_VVB_PRIVATE_KEY = vvbKey;
    process.env.DEMO_REGISTRY_ADDRESS = "0x00000000000000000000000000000000000000bb";
    await expect(attestReadings(base)).rejects.toMatchObject({ httpStatus: 409, message: /Needs VVB approval/ });
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("step 1 publishes nothing when the dry-run fails for any reason other than the missing VVB", async () => {
    simulateContract.mockRejectedValue(new Error("OutsideCreditingPeriod(1700000000, 1700086400)"));
    await expect(attestReadings({ ...base, publishForApproval: true })).rejects.toThrow(
      /would reject this attestation/,
    );
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("step 1 publishes nothing when the module's preview disagrees with the engine", async () => {
    mockReads(0n);
    await expect(attestReadings({ ...base, publishForApproval: true })).rejects.toThrow(/nothing was published/);
    expect(publishMessage).not.toHaveBeenCalled();
    expect(getGasPrice).not.toHaveBeenCalled();
  });

  it("step 1 publishes data then report and returns the VerifierApproval typed data", async () => {
    simulateContract.mockRejectedValue(new Error("UnregisteredVerifier(0x1234)"));
    publishMessage
      .mockResolvedValueOnce({ topicId: `0.0.${TOPIC}`, topicNum: TOPIC, sequenceNumber: 41n, transactionId: "t1" })
      .mockResolvedValueOnce({ topicId: `0.0.${TOPIC}`, topicNum: TOPIC, sequenceNumber: 42n, transactionId: "t2" });
    const outcome = await attestReadings({ ...base, publishForApproval: true });
    expect(outcome.status).toBe("awaiting-approval");
    if (outcome.status !== "awaiting-approval") return;
    expect(publishMessage).toHaveBeenCalledTimes(2);
    expect(outcome.anchor).toEqual(anchor);
    expect(outcome.approval.primaryType).toBe("VerifierApproval");
    expect(outcome.approval.message.hcsSequence).toBe("42");
    expect(outcome.approval.domain).toMatchObject({ name: "DmrvRegistry", chainId: 296, verifyingContract: REGISTRY });
  });

  it("step 2 refuses a VVB signature over different verified figures, before relaying", async () => {
    const signature = signApproval(vvbKey, approval({ ...monitored, netWh: monitored.netWh + 1 }));
    await expect(attestReadings({ ...base, anchor, verifierSignature: signature })).rejects.toMatchObject({
      httpStatus: 409,
      message: /not a registered verifier/,
    });
    expect(publishMessage).not.toHaveBeenCalled();
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("step 2 refuses an anchor whose report hash the readings do not reproduce", async () => {
    const signature = signApproval(vvbKey, approval());
    const wrong = { ...anchor, reportHash: `0x${"44".repeat(32)}` as Hex };
    await expect(attestReadings({ ...base, anchor: wrong, verifierSignature: signature })).rejects.toThrow(
      /do not reproduce the step-1 report/,
    );
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("step 2 accepts the registered VVB's signature and dry-runs it without republishing", async () => {
    const signature = signApproval(vvbKey, approval());
    simulateContract.mockRejectedValue(new Error("EvidenceAlreadyUsed"));
    await expect(attestReadings({ ...base, anchor, verifierSignature: signature })).rejects.toThrow(
      /would reject this attestation: .*EvidenceAlreadyUsed/,
    );
    expect(simulateContract).toHaveBeenCalledTimes(1);
    const [{ args }] = simulateContract.mock.calls[0];
    expect(args[0]).toMatchObject({ verifierSignature: signature, hcsSequence: 42n, reportHash: REPORT_HASH });
    expect(publishMessage).not.toHaveBeenCalled();
  });
});
