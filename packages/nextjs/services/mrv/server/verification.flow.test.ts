import { signVerification } from "../approval";
import { VERIFICATION_SCHEMA, buildVerificationMessage } from "../verification";
import type { AttestationView } from "../views";
import { prepareVerification, submitVerification } from "./verification";
import { type Hex, stringToBytes, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publishMessage = vi.fn();
const readContract = vi.fn();
const simulateContract = vi.fn();
const reproduce = vi.fn();
const mirror = vi.fn();

const REGISTRY = "0x00000000000000000000000000000000000000aa" as const;
const TOPIC = 10_729_650n;
const OPERATOR = "0x00000000000000000000000000000000000000b1" as const;
const METER = "0x00000000000000000000000000000000000000b2" as const;
const vvbKey = generatePrivateKey();
const vvb = privateKeyToAccount(vvbKey).address;
const CHAIN = [`0x${"a1".repeat(32)}`, `0x${"a2".repeat(32)}`] as Hex[];

const record = (sequence: number): AttestationView =>
  ({
    id: sequence,
    plantId: "HYDRO-DEMO-01",
    sequence,
    periodStart: 1_780_000_000 + sequence * 86_400,
    periodEnd: 1_780_086_400 + sequence * 86_400,
    reductionG: 600_000,
    chainHash: CHAIN[sequence],
    hcsTopicId: `0.0.${TOPIC}`,
    hcsSequence: 10 + sequence,
  }) as AttestationView;

vi.mock("./hcs", () => ({ publishMessage: (...args: unknown[]) => publishMessage(...args) }));
vi.mock("../audit", () => ({ reproduceAttestation: (...args: unknown[]) => reproduce(...args) }));
vi.mock("../mirror", () => ({ fetchTopicMessage: (...args: unknown[]) => mirror(...args) }));
vi.mock("../network", async importOriginal => ({
  ...(await importOriginal<typeof import("../network")>()),
  HYDRO_CHAIN_ID: 296,
  isLiveHederaChain: () => true,
}));
vi.mock("./registry", () => ({
  getPlant: vi.fn(async () => ({
    plantId: "HYDRO-DEMO-01",
    operator: OPERATOR,
    meter: METER,
    reporter: null,
    design: {},
    verifiedRecords: 0,
    unissuedBalanceG: 0,
    ledger: { attestations: 2 },
  })),
  getAttestations: vi.fn(async () => [record(0), record(1)]),
  getAttestation: vi.fn(async (id: number) => record(id)),
  publicClient: () => ({ readContract: async () => 2n }),
  requireDeployment: () => ({
    address: REGISTRY,
    abi: [],
    errorAbi: [],
    client: { readContract, simulateContract, getGasPrice: vi.fn(), waitForTransactionReceipt: vi.fn() },
  }),
  hydroChain: () => ({ id: 296 }),
  hydroTransport: () => ({}),
}));

beforeEach(() => {
  for (const mock of [publishMessage, readContract, simulateContract, reproduce, mirror]) mock.mockReset();
  reproduce.mockResolvedValue({ status: "reproduced", checks: [], audit: { status: "verified", checks: [] } });
  readContract.mockImplementation(async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
    if (functionName === "auditTopic") return TOPIC;
    if (functionName === "evidenceUsed") return false;
    if (functionName === "VERIFIER_ROLE") return `0x${"ab".repeat(32)}`;
    if (functionName === "hasRole") return String(args?.[1]).toLowerCase() === vvb.toLowerCase();
    throw new Error(`unexpected read ${functionName}`);
  });
  process.env.HEDERA_OPERATOR_ID = "0.0.1001";
  process.env.HEDERA_OPERATOR_KEY = generatePrivateKey().slice(2);
  process.env.HCS_TOPIC_ID = `0.0.${TOPIC}`;
});

describe("verification: a VVB closes a run of monitoring records", () => {
  it("checks each pending record's hash-chain link against the record before it", async () => {
    publishMessage.mockResolvedValue({ topicId: `0.0.${TOPIC}`, topicNum: TOPIC, sequenceNumber: 77n });
    await prepareVerification({ plantId: "HYDRO-DEMO-01", decision: "approve" });
    const previous = reproduce.mock.calls.map(call => call[4]);
    expect(previous).toEqual([zeroHash, CHAIN[0]]);
  });

  it("refuses to prepare an approval when a record does not reproduce, and publishes nothing", async () => {
    reproduce
      .mockResolvedValueOnce({ status: "reproduced", checks: [], audit: { status: "verified", checks: [] } })
      .mockResolvedValueOnce({
        status: "diverged",
        checks: [{ field: "ER (g)", ok: false }],
        audit: { status: "verified", checks: [] },
      });
    await expect(prepareVerification({ plantId: "HYDRO-DEMO-01", decision: "approve" })).rejects.toMatchObject({
      httpStatus: 409,
      message: /Records 1 do not reproduce/,
    });
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("publishes the verification report and returns the statement over the chain head", async () => {
    publishMessage.mockResolvedValue({ topicId: `0.0.${TOPIC}`, topicNum: TOPIC, sequenceNumber: 77n });
    const prepared = await prepareVerification({
      plantId: "HYDRO-DEMO-01",
      decision: "approve",
      deductionG: 5_000,
      findings: "Spot-checked calibration certificates",
    });
    expect(publishMessage).toHaveBeenCalledTimes(1);
    expect(prepared.report).toMatchObject({
      schema: VERIFICATION_SCHEMA,
      records: { first: 0, last: 1 },
      recordsHash: CHAIN[1],
      monitoredG: 1_200_000,
      deductionG: 5_000,
      unitsToIssue: 1_195,
    });
    expect(prepared.statement).toMatchObject({
      firstRecord: 0,
      lastRecord: 1,
      recordsHash: CHAIN[1],
      deductionG: "5000",
      hcsSequence: "77",
      decision: 1,
    });
    expect(prepared.typedData.primaryType).toBe("VerificationStatement");
    expect(prepared.typedData.domain).toMatchObject({
      name: "DmrvRegistry",
      version: "2",
      verifyingContract: REGISTRY,
    });
  });

  const published = () => {
    const { message, reportHash, body } = buildVerificationMessage({
      plantId: "HYDRO-DEMO-01",
      chainId: 296,
      registry: REGISTRY,
      records: { first: 0, last: 1 },
      recordsHash: CHAIN[1],
      decision: "approve",
      monitoredG: 1_200_000,
      deductionG: 0,
      reproduced: 2,
      diverged: [],
      evidenceHash: null,
      findings: "",
      unissuedBalanceG: 0,
    });
    mirror.mockResolvedValue({ message: Buffer.from(stringToBytes(message)).toString("base64") });
    const statement = {
      firstRecord: 0,
      lastRecord: 1,
      recordsHash: CHAIN[1],
      deductionG: "0",
      reportHash,
      hcsTopicNum: TOPIC.toString(),
      hcsSequence: "77",
      evidenceHash: zeroHash,
      decision: 1,
    };
    return { body, statement };
  };

  const sign = (key: Hex, statement: ReturnType<typeof published>["statement"]) =>
    signVerification(
      key,
      { chainId: 296, registry: REGISTRY },
      {
        plantId: "HYDRO-DEMO-01",
        ...statement,
        recordsHash: statement.recordsHash as Hex,
        reportHash: statement.reportHash as Hex,
        deductionG: 0n,
        hcsTopicNum: TOPIC,
        hcsSequence: 77n,
        evidenceHash: zeroHash,
      },
    );

  it("refuses a signature from a key without VERIFIER_ROLE before relaying", async () => {
    const { statement } = published();
    const signature = sign(generatePrivateKey(), statement);
    await expect(submitVerification({ plantId: "HYDRO-DEMO-01", statement, signature })).rejects.toThrow(
      /does not hold VERIFIER_ROLE/,
    );
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("refuses a statement whose report is not the one published at its HCS anchor", async () => {
    const { statement } = published();
    const tampered = { ...statement, deductionG: "0", recordsHash: CHAIN[0] };
    await expect(
      submitVerification({ plantId: "HYDRO-DEMO-01", statement: tampered, signature: sign(vvbKey, tampered) }),
    ).rejects.toThrow(/does not match the verification report/);
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("dry-runs verifyPeriod with the VVB's signature once every check passes", async () => {
    const { statement } = published();
    simulateContract.mockRejectedValue(new Error("RecordsHashMismatch"));
    await expect(
      submitVerification({ plantId: "HYDRO-DEMO-01", statement, signature: sign(vvbKey, statement) }),
    ).rejects.toThrow(/would reject this verification: .*RecordsHashMismatch/);
    const [{ functionName, args }] = simulateContract.mock.calls[0];
    expect(functionName).toBe("verifyPeriod");
    expect(args[0]).toMatchObject({ firstRecord: 0, lastRecord: 1, recordsHash: CHAIN[1], decision: 1 });
  });
});
